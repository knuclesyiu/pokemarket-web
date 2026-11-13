/**
 * Buyer cancels their own pending offer.
 */
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { FieldValue } from 'firebase-admin/firestore';
const db = admin.firestore();

export const cancelOffer = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', '需要登入');
  const buyerId = request.auth.uid;
  const { offerId } = request.data as any;

  const ref = db.doc(`offers/${offerId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new functions.HttpsError('not-found', '出價不存在');
  const offer = snap.data() as any;
  if (offer.buyerId !== buyerId) {
    throw new functions.HttpsError('permission-denied', '只有出價者可以取消');
  }
  if (offer.status !== 'pending') {
    throw new functions.HttpsError('failed-precondition', '只有 pending 出價可取消');
  }
  await ref.update({
    status: 'cancelled',
    cancelledAt: FieldValue.serverTimestamp(),
  });
  return { offerId, newStatus: 'cancelled' };
});
