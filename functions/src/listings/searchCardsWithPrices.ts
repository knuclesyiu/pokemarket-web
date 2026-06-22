/**
 * Full-text search across card_prices + listings.
 * This is a placeholder — for production use Algolia or Typesense.
 * For now, does a simple Firestore query on the card_prices collection.
 */
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export const searchCardsWithPrices = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', '需要登入');
  const { query: q, language } = request.data as { query: string; language?: string };
  if (!q || q.trim().length < 2) return { cards: [] };

  // Naive: pull top 500 by price and filter in-memory
  // TODO: integrate Algolia for true full-text search
  const snap = await db.collection('card_prices')
    .where('priceHkd', '>', 0)
    .orderBy('priceHkd', 'desc')
    .limit(500)
    .get();

  const lower = q.toLowerCase();
  const cards = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter((c: any) => {
      if (language && c.language && c.language !== language) return false;
      const name = (c.name ?? '').toLowerCase();
      const set = (c.set ?? '').toLowerCase();
      return name.includes(lower) || set.includes(lower);
    })
    .slice(0, 20);

  return { cards };
});
