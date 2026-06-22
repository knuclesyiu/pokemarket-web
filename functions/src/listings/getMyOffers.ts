/**
 * List offers sent or received by the current user.
 */
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export const getMyOffers = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', '需要登入');
  const uid = request.auth.uid;
  const { type, status } = request.data as { type?: 'sent' | 'received' | 'all'; status?: string };

  let field = type === 'received' ? 'sellerId' : 'buyerId';
  let q: admin.firestore.Query = db.collection('offers').where(field, '==', uid).orderBy('createdAt', 'desc').limit(100);
  if (status) q = q.where('status', '==', status);

  const snap = await q.get();
  return {
    offers: snap.docs.map(d => ({ id: d.id, ...d.data() })),
    total: snap.size,
  };
});
