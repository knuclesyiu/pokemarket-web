/**
 * Refresh the card catalogue from TCGdex.
 *
 * The catalogue in `card_prices` was written once, six months ago, by
 * the Python scraper. Prices move, and a marketplace that quotes
 * stale prices is a marketplace nobody trusts. This refreshes the
 * cards that matter from TCGdex's live pricing and keeps the search
 * index in step.
 *
 * Two jobs, both safe to run repeatedly:
 *
 *   1. Price refresh — take the cards with a market price, ordered by
 *      price, and re-read their pricing from TCGdex. The most
 *      valuable cards are refreshed first because that is what the
 *      home feed shows and what people trade.
 *
 *   2. Name index backfill — write a lowercased `nameLower` on every
 *      document. Search uses a prefix range on that field, so a
 *      card can be found by the start of its name without scanning
 *      the collection. Without it, search can only reach the top
 *      few hundred cards by price.
 *
 * The FX rate is fetched live so the HKD figures track the euro.
 */

import * as functions from 'firebase-functions/v2/https';
import * as functionsScheduler from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const db = admin.firestore();

const TCGDEX_BASE = 'https://api.tcgdex.net/v2/en';
const FX_URL = 'https://api.frankfurter.app/latest?from=EUR&to=HKD';

/** TCGdex asks callers to be gentle. */
const REQUEST_GAP_MS = 220;

/** Firestore allows 500 operations per batch. */
const BATCH_SIZE = 400;

interface Fx {
  eurToHkd: number;
  usdToHkd: number;
  date: string;
}

async function getFx(): Promise<Fx> {
  try {
    const res = await fetch(FX_URL, { redirect: 'follow' });
    const data: any = await res.json();
    const eurToHkd = Number(data?.rates?.HKD ?? 0);
    if (!eurToHkd) throw new Error('no HKD rate in the response');
    // The scraper derived USD from EUR at a fixed 1.08; keep the same
    // relationship so the two sets of documents stay comparable.
    return {
      eurToHkd,
      usdToHkd: Number((eurToHkd / 1.08).toFixed(4)),
      date: String(data?.date ?? ''),
    };
  } catch (e) {
    console.warn('[syncCardPrices] FX fetch failed, using the last known rate', e);
    return { eurToHkd: 8.6714, usdToHkd: 8.0281, date: '' };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetch one card from TCGdex, or null when it is not there. */
async function fetchCard(cardId: string): Promise<any | null> {
  try {
    const res = await fetch(`${TCGDEX_BASE}/cards/${encodeURIComponent(cardId)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    if (!data || !data.id) return null;
    return data;
  } catch {
    return null;
  }
}

/** Turn a TCGdex card into the fields the app reads. */
function toPriceFields(card: any, fx: Fx) {
  const pricing = card.pricing ?? {};
  const cm = pricing.cardmarket ?? {};
  const tcg = pricing.tcgplayer ?? {};

  const priceEur = round2(
    Number(cm.avg ?? cm.trend ?? cm.low ?? 0),
  );
  const priceUsd = round2(
    Number(tcg.averagePrice ?? tcg.marketPrice ?? 0),
  );
  const trendEur = round2(Number(cm.trend ?? 0));
  const avg7Eur = round2(Number(cm.avg7 ?? 0));
  const avg30Eur = round2(Number(cm.avg30 ?? 0));
  const lowestEur = round2(Number(cm.low ?? 0));

  const cardmarketHkd = round2(priceEur * fx.eurToHkd);
  const tcgplayerHkd = round2(priceUsd * fx.usdToHkd);

  return {
    priceEur,
    priceUsd,
    trendEur,
    avg7Eur,
    avg30Eur,
    lowestEur,
    cardmarketHkd,
    tcgplayerHkd,
    priceHkd: Math.max(cardmarketHkd, tcgplayerHkd),
    change24hPct: avg7Eur > 0 ? round1(((trendEur - avg7Eur) / avg7Eur) * 100) : 0,
    change30dPct: avg30Eur > 0 ? round1(((trendEur - avg30Eur) / avg30Eur) * 100) : 0,
    fxEurToHkd: fx.eurToHkd,
    fxUsdToHkd: fx.usdToHkd,
  };
}

/** TCGdex images come back as a path; the app wants a full URL. */
function imageUrl(cardId: string, card: any): string {
  const img = String(card.image ?? '');
  if (!img) return `https://api.tcgdex.net/cards/${cardId}/high.png`;
  if (img.startsWith('http')) {
    return /\.(png|jpg|jpeg|webp)$/i.test(img) ? img : `${img.replace(/\/?$/, '')}/high.png`;
  }
  return img.startsWith('/')
    ? `https://api.tcgdex.net${img}/high.png`
    : `https://api.tcgdex.net/${img}/high.png`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Write the lowercased name the search query ranges over.
 *
 * The collection holds 23,000 documents and Firestore cannot ask for
 * "the ones where this field is missing", so the work is done in
 * document-id order with a cursor kept between runs. A plain
 * `limit()` would return the same first page every time and never get
 * past it.
 */
async function backfillNameIndex(maxDocs: number): Promise<number> {
  const cursorRef = db.doc('sync_meta/name_index_cursor');
  const cursorSnap = await cursorRef.get();
  const after = cursorSnap.data()?.afterId as string | undefined;

  let query = db.collection('card_prices').orderBy(admin.firestore.FieldPath.documentId());
  if (after) {
    query = query.startAfter(after);
  }
  const snap = await query.limit(Math.min(maxDocs, 20000)).get();
  if (snap.empty) {
    // The end of the collection — start again next time.
    await cursorRef.set({ afterId: null, wrappedAt: Date.now() }, { merge: true });
    return 0;
  }

  let written = 0;
  let batch = db.batch();
  let pending = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.nameLower === undefined) {
      const nameLower = String(data.name ?? '').trim().toLowerCase();
      batch.set(doc.ref, { nameLower }, { merge: true });
      pending += 1;
      written += 1;
    }
    if (pending >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }
  if (pending > 0) await batch.commit();

  const last = snap.docs[snap.docs.length - 1];
  await cursorRef.set(
    { afterId: last.id, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  return written;
}

/** The cards worth refreshing: the ones with a market price, dearest first. */
async function pickCardsToRefresh(limit: number): Promise<string[]> {
  const snap = await db
    .collection('card_prices')
    .where('priceHkd', '>', 0)
    .orderBy('priceHkd', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.id);
}

interface SyncResult {
  fx: Fx;
  refreshed: number;
  withPrice: number;
  withoutPrice: number;
  namesIndexed: number;
  errors: string[];
}

/**
 * The body of the sync, shared by the manual trigger and the
 * schedule.
 */
async function runSync(opts: {
  cardLimit: number;
  nameBackfillLimit: number;
  cardIds?: string[];
}): Promise<SyncResult> {
  const fx = await getFx();
  const errors: string[] = [];

  const namesIndexed = await backfillNameIndex(opts.nameBackfillLimit);

  const ids =
    opts.cardLimit === 0
      ? []
      : opts.cardIds?.length
        ? opts.cardIds
        : await pickCardsToRefresh(opts.cardLimit);

  let refreshed = 0;
  let withPrice = 0;
  let withoutPrice = 0;

  const now = new Date();
  const fetchedAt = now.toISOString();
  const fetchedAtTs = now.getTime();

  let batch = db.batch();
  let pending = 0;

  const flush = async () => {
    if (pending > 0) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  };

  for (const cardId of ids) {
    const card = await fetchCard(cardId);
    if (!card) {
      errors.push(cardId);
      continue;
    }

    const prices = toPriceFields(card, fx);
    if (prices.priceHkd > 0) withPrice += 1;
    else withoutPrice += 1;

    batch.set(
      db.collection('card_prices').doc(cardId),
      {
        id: cardId,
        name: card.name ?? cardId,
        localId: card.localId ?? '',
        set: card.set?.name ?? '',
        setCode: card.set?.id ?? '',
        rarity: card.rarity ?? '',
        imageUrl: imageUrl(cardId, card),
        number: String(card.number ?? ''),
        series: card.series ?? '',
        nameLower: String(card.name ?? '').trim().toLowerCase(),
        ...prices,
        fetchedAt,
        fetchedAtTs,
        source: 'tcgdex',
      },
      { merge: true },
    );
    pending += 1;
    refreshed += 1;

    if (pending >= BATCH_SIZE) await flush();
    await sleep(REQUEST_GAP_MS);
  }
  await flush();

  await db.doc('sync_meta/card_prices').set(
    {
      lastRunAt: now.toISOString(),
      lastRunTs: fetchedAtTs,
      refreshed,
      fx,
    },
    { merge: true },
  );

  return { fx, refreshed, withPrice, withoutPrice, namesIndexed, errors };
}

/**
 * Manual trigger. Signed-in users may run it, but not more often than
 * once every ten minutes — it makes a few hundred outbound requests
 * and TCGdex rate-limits by IP.
 */
export const syncCardPrices = functions.onCall(
  {
    timeoutSeconds: 540,
    memory: '512MiB',
    // The first deployment of this function was refused by the
    // platform before the request reached it: the raw response was
    // an HTML 401 while every other callable answered with JSON.
    // The invoker binding is set explicitly so it does not depend on
    // what the deploy happened to leave behind.
    invoker: 'public',
  },
  async (request) => {
    if (!request.auth) {
      throw new functions.HttpsError('unauthenticated', '需要登入');
    }

    // Two gates. The price refresh makes a few hundred outbound
    // requests, and TCGdex rate-limits by IP, so that part waits ten
    // minutes between runs. The name backfill only reads and writes
    // Firestore, so it is allowed to run every minute — otherwise
    // indexing 18,000 documents would take three hours.
    const now = Date.now();

    const refreshGate = db.doc('sync_meta/price_sync_gate');
    const refreshSnap = await refreshGate.get();
    const lastRefresh = Number(refreshSnap.data()?.lastAt ?? 0);
    // When the refresh gate is closed the run still goes ahead — it
    // just skips the outbound price refresh and indexes more names.
    // Throwing here would block the backfill for ten minutes at a
    // time, and indexing the collection would take three hours.
    const refreshBlocked =
      Boolean(lastRefresh) && now - lastRefresh < 10 * 60 * 1000;
    if (!refreshBlocked) {
      await refreshGate.set({ lastAt: now }, { merge: true });
    }

    const indexGate = db.doc('sync_meta/name_index_gate');
    const indexSnap = await indexGate.get();
    const lastIndex = Number(indexSnap.data()?.lastAt ?? 0);
    if (lastIndex && now - lastIndex < 60 * 1000) {
      throw new functions.HttpsError(
        'resource-exhausted',
        '名稱索引剛啱做咗，請一分鐘後再試。',
      );
    }

    await indexGate.set({ lastAt: now }, { merge: true });

    const data = (request.data ?? {}) as {
      cardLimit?: number;
      nameBackfillLimit?: number;
      cardIds?: string[];
    };

    const result = await runSync({
      cardLimit: refreshBlocked
        ? 0
        : Math.min(Math.max(data.cardLimit ?? 200, 1), 400),
      nameBackfillLimit: Math.min(
        Math.max(data.nameBackfillLimit ?? 5000, 0),
        20000,
      ),
      cardIds: Array.isArray(data.cardIds) ? data.cardIds.slice(0, 400) : undefined,
    });

    return {
      refreshed: result.refreshed,
      withPrice: result.withPrice,
      withoutPrice: result.withoutPrice,
      namesIndexed: result.namesIndexed,
      fx: result.fx,
      failed: result.errors.length,
      refreshSkipped: refreshBlocked,
    };
  },
);

/**
 * The scheduled refresh. Runs on its own so the catalogue keeps
 * moving without anyone pressing a button.
 */
export const scheduledCardPriceSync = functionsScheduler.onSchedule(
  {
    schedule: 'every 6 hours',
    timeZone: 'Asia/Hong_Kong',
    timeoutSeconds: 540,
    memory: '512MiB',
    invoker: 'public',
  },
  async () => {
    try {
      const result = await runSync({
        cardLimit: 300,
        nameBackfillLimit: 20000,
      });
      console.log(
        `[scheduledCardPriceSync] refreshed=${result.refreshed} ` +
          `priced=${result.withPrice} namesIndexed=${result.namesIndexed} ` +
          `failed=${result.errors.length}`,
      );
    } catch (e) {
      console.error('[scheduledCardPriceSync] failed', e);
    }
  },
);
