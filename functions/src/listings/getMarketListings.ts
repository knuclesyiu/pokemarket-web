/**
 * List active market listings, with optional filters.
 */
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export const getMarketListings = functions.onCall(async (request) => {
  // No auth required — public catalog
  const { rarity, minPrice, maxPrice, condition, type, limit: lim } = request.data as any;
  const cap = Math.min(lim ?? 50, 200);

  let q: admin.firestore.Query = db.collection('listings')
    .where('status', '==', 'active')
    .orderBy('createdAt', 'desc')
    .limit(cap);
  if (minPrice !== undefined) q = q.where('price', '>=', minPrice);
  if (maxPrice !== undefined) q = q.where('price', '<=', maxPrice);
  if (condition) q = q.where('condition', '==', condition);

  const snap = await q.get();
  let listings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (rarity) listings = listings.filter((l: any) => l.rarity === rarity);
  if (type) listings = listings.filter((l: any) => l.type === type);

  return { listings, total: listings.length };
});
