/**
 * Get an order's status. Only the buyer or the seller may read it.
 */
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export const getOrderStatus = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', '需要登入');
  const uid = request.auth.uid;

  const { orderId } = request.data as { orderId?: string };
  if (!orderId) {
    throw new functions.HttpsError('invalid-argument', '缺少 orderId');
  }

  const snap = await db.doc(`orders/${orderId}`).get();
  if (!snap.exists) {
    throw new functions.HttpsError('not-found', '訂單不存在');
  }

  const order = snap.data() as any;
  if (order.buyerId !== uid && order.sellerId !== uid) {
    throw new functions.HttpsError('permission-denied', '你唔可以睇呢張訂單');
  }

  return { status: order.status ?? 'unknown', orderId };
});
