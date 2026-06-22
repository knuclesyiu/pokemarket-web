/**
 * Refund payment — admin or dispute resolution tool.
 * In production, gate this behind admin claim.
 */
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

const db = admin.firestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2024-12-18.acacia',
});

export const refundPayment = functions.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.HttpsError('unauthenticated', '需要登入');
  }
  // TODO: check request.auth.token.admin === true for production
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

  // Issue refund
  const refund = await stripe.refunds.create({
    payment_intent: order.paymentIntentId,
    reason: 'requested_by_customer',
    metadata: { orderId, reason },
  });

  // Webhook will update the order status. We just write the intent here.
  await orderRef.update({
    status: 'refund_pending',
    refundId: refund.id,
    refundReason: reason,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { orderId, refundId: refund.id, status: refund.status };
});
