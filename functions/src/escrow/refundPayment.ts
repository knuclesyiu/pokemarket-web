/**
 * Refund payment — the buyer asks for their money back, or an
 * administrator resolves a dispute.
 *
 * Authorisation matters here more than anywhere else in the codebase:
 * without it, any signed-in user could refund any order on the
 * platform and take the money. The caller has to be the buyer of the
 * order, or carry an `admin` custom claim.
 *
 * The order's state decides what has to be undone:
 *   - money still in escrow: the buyer's pending escrow goes back up
 *   - money already released to the seller's balance: the seller's
 *     balance goes down instead, or the platform would owe the seller
 *     money for a card that was refunded
 *
 * The webhook sets the final status; this records the intent.
 */
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { stripeClient, stripeSecretKey } from '../shared/stripe';

const db = admin.firestore();

/** Statuses where the buyer's money is still sitting in escrow. */
const IN_ESCROW = ['awaiting_payment', 'paid', 'shipped', 'confirmed', 'pending_release'];

export const refundPayment = functions.onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
  if (!request.auth) {
    throw new functions.HttpsError('unauthenticated', '需要登入');
  }
  const { orderId, reason } = request.data as { orderId: string; reason: string };

  const orderRef = db.doc(`orders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new functions.HttpsError('not-found', '訂單不存在');
  }
  const order = orderSnap.data() as any;
  if (!order.paymentIntentId) {
    throw new functions.HttpsError('failed-precondition', '無 PaymentIntent');
  }

  // Only the buyer of this order, or an administrator, may refund it.
  const isAdmin = request.auth.token.admin === true;
  if (!isAdmin && order.buyerId !== request.auth.uid) {
    throw new functions.HttpsError(
      'permission-denied',
      '只有買家可以為呢張訂單申請退款',
    );
  }
  if (!isAdmin && order.sellerId === request.auth.uid) {
    throw new functions.HttpsError(
      'permission-denied',
      '賣家唔可以為自己嘅訂單退款',
    );
  }
  if (order.status === 'refunded' || order.status === 'refund_pending') {
    throw new functions.HttpsError('failed-precondition', '呢張訂單已經退款');
  }

  // Issue the refund on the platform's own charge — the money is still
  // here, which is what the escrow is for.
  const refund = await stripeClient().refunds.create({
    payment_intent: order.paymentIntentId,
    reason: 'requested_by_customer',
    metadata: { orderId, reason: reason ?? '' },
  });

  // The webhook finalises the status and the ledgers. This records
  // the intent so the two can be reconciled.
  await orderRef.update({
    status: 'refund_pending',
    refundId: refund.id,
    refundReason: reason ?? '',
    refundedBy: request.auth.uid,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    orderId,
    refundId: refund.id,
    status: refund.status,
    wasInEscrow: IN_ESCROW.includes(order.status),
  };
},
);;
