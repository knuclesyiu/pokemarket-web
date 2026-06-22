/**
 * PokeMarket — Card Price Data Service
 *
 * Centralized Firestore reads for card_prices collection. All real price data
 * (Cardmarket / TCGplayer) is written there by the Python sync script
 * (`src/services/priceScraper/sync_all_cards.py`) and exposed to the app
 * via these helpers.
 *
 * Schema in Firestore (per doc id = TCGdex card id e.g. "swsh5-115"):
 *   - name: string
 *   - set, setCode, rarity, imageUrl, number, series
 *   - priceHkd, cardmarketHkd, tcgplayerHkd, priceEur, priceUsd
 *   - trendEur, avg7Eur, avg30Eur        ← history approximation
 *   - change24hPct, change30dPct
 *   - fxEurToHkd, fxUsdToHkd
 *   - fetchedAt (ISO), fetchedAtTs (ms epoch), source
 */

import {
  doc, getDoc, getDocs, collection, query, where, limit, orderBy,
} from 'firebase/firestore';
import { db } from './firebase';
import { PokemonCard, PricePoint } from '../types';

export interface CardPriceData {
  id: string;
  name: string;
  set: string;
  setCode: string;
  rarity: string;
  imageUrl: string;
  number: string;
  series: string;
  priceHkd: number;
  cardmarketHkd: number;
  tcgplayerHkd: number;
  priceEur: number;
  priceUsd: number;
  trendEur: number;
  avg7Eur: number;
  avg30Eur: number;
  change24hPct: number;
  change30dPct: number | null;
  fxEurToHkd: number;
  fxUsdToHkd: number;
  fetchedAtTs: number;
  source: string;
}

/**
 * Get full price doc by card id (e.g. "swsh5-115").
 * Returns null if not found.
 */
export async function getCardPrice(cardId: string): Promise<CardPriceData | null> {
  if (!cardId) return null;
  try {
    const snap = await getDoc(doc(db, 'card_prices', cardId));
    if (!snap.exists()) return null;
    const d = snap.data() as any;
    return normalizePriceDoc(snap.id, d);
  } catch (e) {
    console.warn('[getCardPrice] error:', e);
    return null;
  }
}

/**
 * Batch lookup — used by HomeScreen to enrich multiple cards in one round-trip.
 * Returns a map keyed by card id.
 */
export async function getCardPrices(ids: string[]): Promise<Record<string, CardPriceData>> {
  const out: Record<string, CardPriceData> = {};
  if (!ids.length) return out;
  // Firestore 'in' query supports up to 30 — chunk
  const BATCH = 30;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    try {
      const snap = await getDocs(query(collection(db, 'card_prices'), where('__name__', 'in', chunk)));
      snap.forEach(d => {
        out[d.id] = normalizePriceDoc(d.id, d.data());
      });
    } catch (e) {
      console.warn('[getCardPrices] batch error:', e);
    }
  }
  return out;
}

/**
 * Build a fake but real-data-derived 30-day history using TCGdex's
 * `trendEur` (current mid), `avg7Eur` (last 7-day average) and `avg30Eur`
 * (last 30-day average). The 3 points become a 3-bar / 3-line chart
 * so the user sees real movement rather than random noise.
 *
 * We anchor:
 *   - day 30 (oldest)  = avg30Eur
 *   - day 7            = avg7Eur
 *   - day 0 (today)    = trendEur
 *
 * Intermediate days are linearly interpolated, with optional synthetic
 * `fetchedAtTs` to keep the date labels consistent.
 */
export function buildPriceHistory(p: CardPriceData, days = 30): PricePoint[] {
  const points: PricePoint[] = [];
  const todayMs = p.fetchedAtTs || Date.now();
  const oneDay = 86400 * 1000;

  if (!p.avg30Eur || !p.avg7Eur || !p.trendEur) {
    // Not enough data — return a single anchor point so the chart still
    // renders something real instead of crashing or showing nothing.
    return [
      { date: new Date(todayMs).toISOString().slice(0, 10), price: Math.round(p.priceHkd || 0) },
    ];
  }

  // 3 anchor points (day 30, day 7, day 0) in EUR — convert to HKD at fetch time
  // but for stable display use the stored HKD price + EUR ratios.
  const eurToHkd = p.fxEurToHkd || (p.priceEur > 0 ? p.priceHkd / p.priceEur : 8.48);
  const day30 = p.avg30Eur * eurToHkd;
  const day7  = p.avg7Eur  * eurToHkd;
  const day0  = p.trendEur * eurToHkd;

  // Linearly interpolate from day 30 → day 7 → day 0
  for (let i = days; i >= 0; i--) {
    let price: number;
    if (i >= 7) {
      // days 30..7: from day30 → day7
      const t = (i - 7) / (30 - 7);
      price = day30 * (1 - t) + day7 * t;
    } else {
      // days 7..0: from day7 → day0
      const t = i / 7;
      price = day7 * (1 - t) + day0 * t;
    }
    points.push({
      date: new Date(todayMs - i * oneDay).toISOString().slice(0, 10),
      price: Math.round(price),
    });
  }
  // Force today point to be the actual priceHkd
  points[points.length - 1].price = Math.round(p.priceHkd);
  return points;
}

/**
 * Build a 3-point summary suitable for PriceChart when 30-day interpolation
 * isn't wanted (e.g. "30天 / 7天 / 當下" labelled comparison).
 */
export function buildPriceHistory3Point(p: CardPriceData): PricePoint[] {
  const todayMs = p.fetchedAtTs || Date.now();
  const oneDay = 86400 * 1000;
  const eurToHkd = p.fxEurToHkd || (p.priceEur > 0 ? p.priceHkd / p.priceEur : 8.48);
  return [
    {
      date: new Date(todayMs - 30 * oneDay).toISOString().slice(0, 10),
      price: Math.round((p.avg30Eur || p.priceEur) * eurToHkd),
    },
    {
      date: new Date(todayMs - 7 * oneDay).toISOString().slice(0, 10),
      price: Math.round((p.avg7Eur || p.priceEur) * eurToHkd),
    },
    {
      date: new Date(todayMs).toISOString().slice(0, 10),
      price: Math.round(p.priceHkd),
    },
  ].filter(p => p.price > 0);
}

/**
 * Search Firestore card_prices by case-insensitive name contains.
 * Used as fallback when `searchCardsWithPrices` Cloud Function is unavailable.
 */
export async function searchCardsByName(
  queryText: string,
  maxResults = 20,
): Promise<CardPriceData[]> {
  const q = queryText.trim();
  if (q.length < 2) return [];
  try {
    // Firestore doesn't have full-text search. We pull priceHkd > 0 docs
    // (the high-signal set) and filter in-memory. For 23k docs this would
    // be slow; but typically only ~82% (~19k) match the filter, and we
    // cap at maxResults. Reconsider Algolia/Meili when scaling.
    const snap = await getDocs(
      query(collection(db, 'card_prices'),
        where('priceHkd', '>', 0),
        orderBy('priceHkd', 'desc'),
        limit(500))   // upper bound for in-memory filter
    );
    const lower = q.toLowerCase();
    const results: CardPriceData[] = [];
    snap.forEach(d => {
      const data = d.data() as any;
      const name = (data.name || '').toLowerCase();
      const set = (data.set || '').toLowerCase();
      if (name.includes(lower) || set.includes(lower)) {
        results.push(normalizePriceDoc(d.id, data));
      }
    });
    return results.slice(0, maxResults);
  } catch (e) {
    console.warn('[searchCardsByName] error:', e);
    return [];
  }
}

/**
 * Map a Firestore card_prices doc into a normalized CardPriceData object,
 * with sensible fallbacks for missing fields.
 */
function normalizePriceDoc(id: string, d: any): CardPriceData {
  // TCGdex image field is a base path. We need a full URL with a quality
  // suffix. Older synced docs have raw `image: "/foo"` (no scheme/host);
  // newer ones may already have a full URL. Normalize both.
  let imageUrl = d.imageUrl || '';
  if (imageUrl && !imageUrl.startsWith('http')) {
    if (imageUrl.startsWith('/')) imageUrl = `https://api.tcgdex.net${imageUrl}`;
    else imageUrl = `https://api.tcgdex.net/${imageUrl}`;
  }
  // If still missing a quality suffix, add /high.png
  if (imageUrl && !/\.(png|jpg|webp|jpeg)$/i.test(imageUrl) && !imageUrl.endsWith('/high.png')) {
    imageUrl = imageUrl.replace(/\/?$/, '/high.png');
  }
  return {
    id,
    name: d.name ?? id,
    set: d.set ?? '',
    setCode: d.setCode ?? '',
    rarity: d.rarity ?? 'Common',
    imageUrl,
    number: String(d.number ?? d.localId ?? ''),
    series: d.series ?? '',
    priceHkd: Number(d.priceHkd ?? 0),
    cardmarketHkd: Number(d.cardmarketHkd ?? 0),
    tcgplayerHkd: Number(d.tcgplayerHkd ?? 0),
    priceEur: Number(d.priceEur ?? 0),
    priceUsd: Number(d.priceUsd ?? 0),
    trendEur: Number(d.trendEur ?? 0),
    avg7Eur: Number(d.avg7Eur ?? 0),
    avg30Eur: Number(d.avg30Eur ?? 0),
    change24hPct: Number(d.change24hPct ?? 0),
    change30dPct: d.change30dPct == null ? null : Number(d.change30dPct),
    fxEurToHkd: Number(d.fxEurToHkd ?? 8.48),
    fxUsdToHkd: Number(d.fxUsdToHkd ?? 7.78),
    fetchedAtTs: Number(d.fetchedAtTs ?? 0),
    source: d.source ?? 'cache',
  };
}

/**
 * Convert CardPriceData to the app's PokemonCard shape (used by listings,
 * card detail, search results, etc.).
 */
export function priceDataToCard(p: CardPriceData): PokemonCard {
  return {
    id: p.id,
    name: p.name,
    set: p.set,
    setCode: p.setCode,
    rarity: (p.rarity as PokemonCard['rarity']) ?? 'Common',
    grade: undefined,
    price: p.priceHkd,
    priceChange24h: p.change24hPct,
    imageUrl: p.imageUrl,
    series: p.series,
    number: p.number,
    condition: 'Near Mint',
    language: 'English',
    listed: true,
    listingCount: 0,
  };
}
