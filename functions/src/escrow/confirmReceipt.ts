/**
 * Confirm receipt — buyer marks card as received, orders goes from
 * 'shipped' to 'confirmed'. Actual release is done by releasePayment.
 */
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export const confirmReceipt = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', '需要登入');
  const { orderId } = request.data as { orderId: string };

  const orderRef = db.doc(`orders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) throw new functions.HttpsError('not-found', '訂單不存在');
  const order = orderSnap.data() as any;
  if (order.buyerId !== request.auth.uid) {
    throw new functions.HttpsError('permission-denied', '只有買家可以確認收貨');
  }
  if (order.status !== 'shipped') {
    throw new functions.HttpsError('failed-precondition', '賣家尚未發貨');
  }
  await orderRef.update({
    status: 'confirmed',
    confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { orderId, status: 'confirmed' };
});
