/**
 * Extend escrow auto-release deadline by 14 days.
 */
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { FieldValue } from 'firebase-admin/firestore';
const db = admin.firestore();

export const extendEscrow = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', '需要登入');
  const { orderId } = request.data as { orderId: string };

  const orderRef = db.doc(`orders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) throw new functions.HttpsError('not-found', '訂單不存在');
  const order = orderSnap.data() as any;
  if (order.buyerId !== request.auth.uid) {
    throw new functions.HttpsError('permission-denied', '只有買家可以延長 escrow');
  }
  if (order.escrowExtended) {
    throw new functions.HttpsError('already-exists', '已經延長過一次');
  }
  const newAutoReleaseAt = Date.now() + 14 * 24 * 60 * 60 * 1000;
  await orderRef.update({
    escrowExtended: true,
    autoReleaseAt: newAutoReleaseAt,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { orderId, newAutoReleaseAt };
});
