/**
 * Create dispute — buyer raises an issue. Triggers admin review.
 */
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { FieldValue } from 'firebase-admin/firestore';
const db = admin.firestore();

export const createDispute = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', '需要登入');
  const { orderId, reason } = request.data as { orderId: string; reason: string };
  if (!reason || reason.trim().length < 10) {
    throw new functions.HttpsError('invalid-argument', '請輸入至少 10 字原因');
  }

  const orderRef = db.doc(`orders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) throw new functions.HttpsError('not-found', '訂單不存在');
  const order = orderSnap.data() as any;
  if (order.buyerId !== request.auth.uid) {
    throw new functions.HttpsError('permission-denied', '只有買家可以開 dispute');
  }
  if (!['paid', 'shipped', 'confirmed'].includes(order.status)) {
    throw new functions.HttpsError('failed-precondition', '此訂單狀態不允許 dispute');
  }

  // Create dispute doc
  const disputeRef = await db.collection('disputes').add({
    orderId,
    buyerId: request.auth.uid,
    sellerId: order.sellerId,
    reason: reason.trim(),
    status: 'open',
    evidence: [],  // buyer uploads images to storage; refs go here
    createdAt: FieldValue.serverTimestamp(),
  });

  // Update order status
  await orderRef.update({
    status: 'disputed',
    disputeId: disputeRef.id,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { orderId, disputeId: disputeRef.id };
});
