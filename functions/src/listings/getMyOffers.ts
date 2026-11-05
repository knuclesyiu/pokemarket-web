/**
 * List offers sent or received by the current user.
 *
 * The client types `Offer.createdAt` as a number, so the Firestore
 * Timestamp is converted to epoch milliseconds on read.
 */
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { toMillis } from '../shared/cards';

const db = admin.firestore();

export const getMyOffers = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', '需要登入');
  const uid = request.auth.uid;
  const { type, status } = request.data as { type?: 'sent' | 'received' | 'all'; status?: string };

  const field = type === 'received' ? 'sellerId' : 'buyerId';
  let q: admin.firestore.Query = db
    .collection('offers')
    .where(field, '==', uid)
    .orderBy('createdAt', 'desc')
    .limit(100);
  if (status) q = q.where('status', '==', status);

  const snap = await q.get();
  const offers = snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      ...data,
      id: d.id,
      createdAt: toMillis(data.createdAt) || Number(data.createdAtMs ?? 0),
      respondedAt: data.respondedAt
        ? toMillis(data.respondedAt) || Number(data.respondedAtMs ?? 0)
        : undefined,
    };
  });

  return { offers, total: offers.length };
});
