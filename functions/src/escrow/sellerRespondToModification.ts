/**
 * Seller responds to buyer's modified release amount.
 *   - accept: release the modified amount
 *   - reject: revert to original; auto-release in 7 days
 */
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { FieldValue } from 'firebase-admin/firestore';
const db = admin.firestore();

export const sellerRespondToModification = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', '需要登入');
  const { orderId, accept } = request.data as { orderId: string; accept: boolean };

  const orderRef = db.doc(`orders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) throw new functions.HttpsError('not-found', '訂單不存在');
  const order = orderSnap.data() as any;
  if (order.sellerId !== request.auth.uid) {
    throw new functions.HttpsError('permission-denied', '只有賣家可以回應');
  }
  if (order.status !== 'pending_seller_consent') {
    throw new functions.HttpsError('failed-precondition', '無待回應的修改');
  }
  const now = FieldValue.serverTimestamp();
  if (accept) {
    await orderRef.update({
      status: 'pending_release',
      sellerConsentGiven: true,
      finalAmountHkd: order.modifiedAmountHkd,
      updatedAt: now,
    });
  } else {
    await orderRef.update({
      status: 'pending_release',
      sellerConsentGiven: false,
      finalAmountHkd: order.amountHkd,  // revert to original
      updatedAt: now,
    });
  }
  return { orderId, accepted: accept };
});
