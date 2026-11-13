/**
 * Create a Stripe PaymentIntent with escrowed funds.
 *
 * Flow:
 *   1. Client (CheckoutScreen) calls this with order details
 *   2. We compute fees via shared feeCalculator (or duplicate constants)
 *   3. Stripe Connect: if seller has a Connect account, use direct charge
 *      with `application_fee_amount` + `transfer_data.destination`
 *   4. Write orders/{orderId} doc with status='awaiting_payment'
 *   5. Return clientSecret to client for Stripe SDK confirmation
 *
 * The client then confirms payment via @stripe/stripe-react-native.
 * Stripe sends a `payment_intent.succeeded` webhook → we update
 * orders/{orderId} status='paid' (i.e. funds in escrow).
 *
 * Auth: client must be signed in. Order must reference a valid seller
 * with a completed Stripe Connect onboarding.
 */

import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { stripeClient } from '../shared/stripe';
import { calculateFee, ESCROW_MIN_HKD } from '../shared/feeCalculator';

const db = admin.firestore();


interface CreatePaymentIntentParams {
  orderId?: string;          // optional — server generates if absent
  amountHkd: number;         // total buyer pays
  sellerId: string;
  deliveryMethod: 'meetup' | 'sf';
  cardName: string;
  cardId: string;
}

export const createPaymentIntent = functions.onCall(async (request) => {
  // 1. Auth
  if (!request.auth) {
    throw new functions.HttpsError('unauthenticated', '需要登入');
  }
  const buyerId = request.auth.uid;
  const data = request.data as CreatePaymentIntentParams;

  // 2. Validate
  if (!data.amountHkd || data.amountHkd < ESCROW_MIN_HKD) {
    throw new functions.HttpsError(
      'invalid-argument',
      `金額需 >= HK$ ${ESCROW_MIN_HKD} (escrow 最低)`,
    );
  }
  if (!data.sellerId || data.sellerId === buyerId) {
    throw new functions.HttpsError('invalid-argument', '無效的賣家');
  }

  // 3. Look up seller's Stripe Connect account
  const sellerSnap = await db.doc(`users/${data.sellerId}`).get();
  if (!sellerSnap.exists) {
    throw new functions.HttpsError('not-found', '賣家帳戶不存在');
  }
  const sellerData = sellerSnap.data() ?? {};
  const sellerStripeAccountId = sellerData.stripeAccountId as string | undefined;
  if (!sellerStripeAccountId) {
    throw new functions.HttpsError(
      'failed-precondition',
      '賣家尚未完成 Stripe 帳戶設定，無法收款',
    );
  }

  // 4. Compute fees
  const fee = calculateFee(data.amountHkd);
  const amountCents = Math.round(data.amountHkd * 100);
  const platformFeeCents = Math.round(fee.platformFeeHkd * 100);

  // 5. Create or update order
  const orderRef = data.orderId
    ? db.doc(`orders/${data.orderId}`)
    : db.collection('orders').doc();
  const orderId = orderRef.id;

  // 6. Create Stripe PaymentIntent with destination charge
  //    (uses seller's connected account, platform takes application_fee)
  const paymentIntent = await stripeClient().paymentIntents.create({
    amount: amountCents,
    currency: 'hkd',
    application_fee_amount: platformFeeCents,
    transfer_data: { destination: sellerStripeAccountId },
    metadata: {
      orderId,
      buyerId,
      sellerId: data.sellerId,
      cardId: data.cardId,
      deliveryMethod: data.deliveryMethod,
    },
    description: `PokeMarket: ${data.cardName}`,
  });

  // 7. Write order doc (status='awaiting_payment' — webhook will flip to 'paid')
  await orderRef.set({
    id: orderId,
    buyerId,
    sellerId: data.sellerId,
    cardId: data.cardId,
    cardName: data.cardName,
    cardSet: sellerData.lastCardSet ?? '',
    cardImageUrl: sellerData.lastCardImageUrl ?? '',
    amountHkd: data.amountHkd,
    platformFeeHkd: fee.platformFeeHkd,
    stripeFeeHkd: fee.stripeFeeHkd,
    totalFeeHkd: fee.totalFeeHkd,
    sellerNetHkd: fee.sellerNetHkd,
    deliveryMethod: data.deliveryMethod,
    paymentIntentId: paymentIntent.id,
    clientSecret: paymentIntent.client_secret,
    sellerStripeAccountId,
    status: 'awaiting_payment',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  // 8. Return
  return {
    orderId,
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    amount: data.amountHkd,
    platformFee: fee.platformFeeHkd,
    sellerNet: fee.sellerNetHkd,
  };
});
