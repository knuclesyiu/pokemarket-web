/**
 * Mark an order as shipped.
 *
 * The buyer pays, the money sits on the platform, and then the card
 * has to travel from the seller to the buyer. This is that step.
 *
 * Without it the order stops at 'paid': confirming receipt requires
 * 'shipped', and releasing the money requires 'confirmed' — which
 * only confirming receipt can produce. A seller who shipped the card
 * had no way to say so, so the money could never be released.
 *
 * For a meetup there is no shipping, so the buyer confirms receipt
 * straight from 'paid' and this function is not used.
 *
 * Auth: the seller of the order. The buyer cannot mark their own card
 * as shipped, and nobody can mark somebody else's order.
 */

import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const db = admin.firestore();

export const markShipped = functions.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.HttpsError('unauthenticated', '需要登入');
  }
  const sellerId = request.auth.uid;
  const { orderId, trackingNumber } = request.data as {
    orderId: string;
    trackingNumber?: string;
  };
  if (!orderId) {
    throw new functions.HttpsError('invalid-argument', '缺少 orderId');
  }

  const orderRef = db.doc(`orders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new functions.HttpsError('not-found', '訂單不存在');
  }
  const order = orderSnap.data() as any;

  if (order.sellerId !== sellerId) {
    throw new functions.HttpsError('permission-denied', '只有賣家可以標記發貨');
  }
  // The money has to be in escrow before the card is on its way.
  if (order.status !== 'paid') {
    throw new functions.HttpsError(
      'failed-precondition',
      `訂單狀態 ${order.status} 未付款，不能標記發貨`,
    );
  }

  await orderRef.update({
    status: 'shipped',
    shippedAt: FieldValue.serverTimestamp(),
    trackingNumber: trackingNumber ?? order.trackingNumber ?? '',
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { orderId, status: 'shipped' };
});
