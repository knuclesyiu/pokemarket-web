/**
 * Shared helpers for reading the card catalogue.
 *
 * The catalogue lives in the `card_prices` collection (doc id = card id,
 * e.g. "swsh5-115"), written by the Python price scraper. TCGdex image
 * fields may be stored as relative paths ("/base1/1"), so they need
 * normalising into full https URLs before they reach the app.
 */

import * as admin from 'firebase-admin';

import { FieldPath } from 'firebase-admin/firestore';
const db = admin.firestore();

/** Normalise a TCGdex image path into a full URL usable by <Image>. */
export function normalizeImageUrl(raw: string | undefined | null): string {
  if (!raw) return '';
  let url = raw;
  if (!url.startsWith('http')) {
    url = url.startsWith('/')
      ? `https://api.tcgdex.net${url}`
      : `https://api.tcgdex.net/${url}`;
  }
  if (!/\.(png|jpg|jpeg|webp)$/i.test(url) && !url.endsWith('/high.png')) {
    url = `${url.replace(/\/?$/, '')}/high.png`;
  }
  return url;
}

/**
 * Fetch the card catalogue docs for the given card ids.
 * Firestore 'in' queries accept at most 30 ids, so they are chunked.
 * Returns a map keyed by card id.
 */
export async function loadCardCatalog(
  cardIds: string[],
): Promise<Record<string, any>> {
  const out: Record<string, any> = {};
  const ids = Array.from(new Set(cardIds.filter(Boolean)));
  if (!ids.length) return out;

  const CHUNK = 30;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    try {
      const snap = await db
        .collection('card_prices')
        .where(FieldPath.documentId(), 'in', chunk)
        .get();
      snap.forEach((d) => {
        out[d.id] = d.data();
      });
    } catch (e) {
      console.warn('[loadCardCatalog] chunk lookup failed', e);
    }
  }
  return out;
}

/**
 * Build the nested `card` object that the app's `TradeCard` type expects
 * from a raw `card_prices` document.
 */
export function buildTradeCard(cardId: string, priceDoc: any): Record<string, any> {
  return {
    id: cardId,
    name: priceDoc?.name ?? cardId,
    set: priceDoc?.set ?? '',
    setCode: priceDoc?.setCode ?? '',
    series: priceDoc?.series ?? '',
    number: String(priceDoc?.number ?? ''),
    rarity: priceDoc?.rarity ?? 'Common',
    condition: priceDoc?.condition ?? 'Near Mint',
    imageUrl: normalizeImageUrl(priceDoc?.imageUrl),
    marketPrice: Number(priceDoc?.priceHkd ?? priceDoc?.cardmarketHkd ?? 0),
  };
}

/** Convert a Firestore Timestamp (or a number) into epoch milliseconds. */
export function toMillis(value: any): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}
