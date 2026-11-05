/**
 * List active market listings, with optional filters.
 *
 * All equality filters are applied before orderBy/limit so the query
 * stays indexable. `cardId` and `condition` are equality filters;
 * `minPrice`/`maxPrice` are range filters on the same field, which
 * Firestore permits (only one field may be ranged).
 */
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { toMillis } from '../shared/cards';

const db = admin.firestore();

export const getMarketListings = functions.onCall(async (request) => {
  // No auth required — public catalog
  const {
    cardId, rarity, minPrice, maxPrice, condition, type, limit: lim,
  } = request.data as any;
  const cap = Math.min(lim ?? 50, 200);

  let q: admin.firestore.Query = db.collection('listings').where('status', '==', 'active');
  if (cardId) q = q.where('cardId', '==', cardId);
  if (condition) q = q.where('condition', '==', condition);
  if (minPrice !== undefined) q = q.where('price', '>=', minPrice);
  if (maxPrice !== undefined) q = q.where('price', '<=', maxPrice);
  q = q.orderBy('createdAt', 'desc').limit(cap);

  const snap = await q.get();
  let listings = snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      ...data,
      id: d.id,
      createdAt: toMillis(data.createdAt) || Number(data.createdAtMs ?? 0),
    };
  });
  if (rarity) listings = listings.filter((l: any) => l.card?.rarity === rarity);
  if (type) listings = listings.filter((l: any) => l.type === type);

  return { listings, total: listings.length };
});
