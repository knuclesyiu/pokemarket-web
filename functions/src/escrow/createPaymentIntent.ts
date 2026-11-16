/**
 * Create a Stripe PaymentIntent with escrowed funds.
 *
 * Flow:
 *   1. Client (CheckoutScreen) calls this with the card price and the
 *      delivery fee. It does not send the total: the fee policy is
 *      the server's to decide, and a client that sent a total would
 *      let it pick its own fees.
 *   2. We compute the fees via shared feeCalculator.
 *   3. The charge stays on the platform account. Stripe holds the money
 *      until the buyer confirms the card, and the seller's money
 *      leaves when the seller withdraws. This is the separate-charges-
 *      and-transfers model, and it is what makes the escrow real.
 *   4. Write orders/{orderId} doc with status='awaiting_payment'
 *   5. Return clientSecret to client for Stripe SDK confirmation
 *
 * The client then confirms payment via @stripe/stripe-react-native.
 * Stripe sends a `payment_intent.succeeded` webhook → we update
 * orders/{orderId} status='paid' (i.e. funds in escrow).
 *
 * Why not a destination charge: `transfer_data.destination` sends the
 * money straight to the seller's connected account the moment the
 * payment succeeds. The platform would then hold nothing to refund
 * from, and the withdrawal it performs — which draws on the platform
 * balance — would have no balance to draw on. A seller could have the
 * money out before the buyer had the card.
 *
 * Auth: client must be signed in. Order must reference a valid seller
 * with a completed Stripe Connect onboarding.
 */

import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { stripeClient, stripeSecretKey } from '../shared/stripe';
import { calculateFee, ESCROW_MIN_HKD } from '../shared/feeCalculator';
import { paymentRail } from '../payment/rail';
import {
  createCollectionIntent,
  retrieveIntent,
} from '../payment/airwallex';

const db = admin.firestore();


interface CreatePaymentIntentParams {
  orderId?: string;          // optional — server generates if absent
  listingId?: string;        // the listing being bought — the price comes from it
  cardPriceHkd?: number;     // ignored: the listing's price is the price
  deliveryFeeHkd?: number;   // ignored: the server decides the shipping charge
  sellerId: string;
  deliveryMethod: 'meetup' | 'sf';
  cardName?: string;
  cardId: string;
}

/** What the platform charges for shipping by courier. */
const DELIVERY_FEE_SF_HKD = 35;

export const createPaymentIntent = functions.onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
  // 1. Auth
  if (!request.auth) {
    throw new functions.HttpsError('unauthenticated', '需要登入');
  }
  const buyerId = request.auth.uid;
  const data = request.data as CreatePaymentIntentParams;

  // 2. Validate
  if (!data.sellerId || data.sellerId === buyerId) {
    throw new functions.HttpsError('invalid-argument', '無效的賣家');
  }

  // The price comes from the listing, not from the client. A client
  // that named the amount would be naming what the seller agreed to
  // sell for — which is the seller's decision, not the buyer's.
  const listingRef = db.doc(`listings/${data.listingId ?? data.cardId}`);
  const listingSnap = await listingRef.get();
  if (!listingSnap.exists) {
    throw new functions.HttpsError('not-found', '掛牌不存在或已下架');
  }
  const listing = listingSnap.data() ?? {};
  if (listing.sellerId !== data.sellerId) {
    throw new functions.HttpsError('invalid-argument', '賣家同掛牌唔對應');
  }
  if (listing.status !== 'active') {
    throw new functions.HttpsError('failed-precondition', '掛牌已售出或已下架');
  }
  const cardPriceHkd = Number(listing.price);
  if (!cardPriceHkd || cardPriceHkd < ESCROW_MIN_HKD) {
    throw new functions.HttpsError(
      'invalid-argument',
      `金額需 >= HK$ ${ESCROW_MIN_HKD} (escrow 最低)`,
    );
  }

  // The delivery fee is a flat amount the platform charges for
  // shipping. It comes from the server: a client that chose its own
  // shipping charge would be choosing how much of the price the
  // platform keeps.
  const deliveryFeeHkd = data.deliveryMethod === 'sf' ? DELIVERY_FEE_SF_HKD : 0;

  // 3. Look up seller's Stripe Connect account.
  //    The connected account lives in `sellers/{uid}` — that is where
  //    createSellerAccount writes it. Looking for it on the user
  //    document instead meant every payment failed with "賣家尚未完成
  //    Stripe 帳戶設定" even for sellers who had finished onboarding.
  const sellerSnap = await db.doc(`users/${data.sellerId}`).get();
  if (!sellerSnap.exists) {
    throw new functions.HttpsError('not-found', '賣家帳戶不存在');
  }

  // Which processor takes the money. The seller does not need a
  // Stripe account on the Airwallex rail — that is the whole point of
  // it — so the check below only applies to Stripe.
  const rail = paymentRail();

  const sellerRecord = await db.doc(`sellers/${data.sellerId}`).get();
  const sellerStripeAccountId = sellerRecord.data()?.stripeAccountId as
    | string
    | undefined;
  if (rail === 'stripe' && !sellerStripeAccountId) {
    throw new functions.HttpsError(
      'failed-precondition',
      '賣家尚未完成 Stripe 帳戶設定，無法收款',
    );
  }

  // 4. Compute fees — the server is the only place the fee policy
  //    lives. The client displays what this produces; it never sends
  //    the total it wants to be charged.
  const fee = calculateFee(cardPriceHkd, rail);
  const buyerTotalHkd = Math.round((fee.buyerTotalHkd + deliveryFeeHkd) * 100) / 100;
  const amountCents = Math.round(buyerTotalHkd * 100);

  // 5. Create or update order
  const orderRef = data.orderId
    ? db.doc(`orders/${data.orderId}`)
    : db.collection('orders').doc();
  const orderId = orderRef.id;

  // 5b. Idempotency. A buyer who taps twice, or whose network drops
  //     after the first call, must not end up with two charges. If the
  //     order already has a PaymentIntent that has not been paid, that
  //     one is the answer.
  const existingOrder = await orderRef.get();
  if (existingOrder.exists) {
    const existing = existingOrder.data() as any;
    if (
      existing.paymentIntentId &&
      existing.paymentIntentStatus !== 'canceled' &&
      ['awaiting_payment', 'payment_failed'].includes(existing.status)
    ) {
      const existingPi =
        rail === 'airwallex'
          ? await retrieveIntent(existing.paymentIntentId)
          : await stripeClient().paymentIntents.retrieve(
              existing.paymentIntentId,
            );
      const stillOpen =
        rail === 'airwallex'
          ? !['SUCCEEDED', 'CANCELLED'].includes(String(existingPi?.status ?? '').toUpperCase())
          : !['canceled', 'succeeded'].includes(existingPi.status);
      if (stillOpen) {
        return {
          orderId,
          clientSecret: existingPi.client_secret,
          paymentIntentId: existingPi.id,
          amount: Number(existing.buyerTotalHkd ?? cardPriceHkd),
          cardPrice: cardPriceHkd,
          platformFee: Number(existing.platformFeeHkd ?? fee.platformFeeHkd),
          totalFee: Number(existing.totalFeeHkd ?? fee.totalFeeHkd),
          sellerNet: Number(existing.sellerNetHkd ?? fee.sellerNetHkd),
          reused: true,
        };
      }
    }
  }

  // 6. Create the payment intent. The charge lands on the platform's
  //    own account, so the processor holds the buyer's money until the
  //    release. No destination, no application fee — the platform fee
  //    is kept out of the balance when the seller is paid.
  let paymentIntentId: string;
  let clientSecret: string;
  if (rail === 'airwallex') {
    const intent = await createCollectionIntent({
      amountHkd: buyerTotalHkd,
      merchantOrderId: orderId,
      requestId: `pm-${orderId}`,
      metadata: {
        orderId,
        buyerId,
        sellerId: data.sellerId,
        cardId: data.cardId,
        deliveryMethod: data.deliveryMethod,
      },
      sellerId: data.sellerId,
      buyerId,
    });
    paymentIntentId = intent.paymentIntentId;
    clientSecret = intent.clientSecret;
  } else {
    const paymentIntent = await stripeClient().paymentIntents.create({
      amount: amountCents,
      currency: 'hkd',
      metadata: {
        orderId,
        buyerId,
        sellerId: data.sellerId,
        cardId: data.cardId,
        deliveryMethod: data.deliveryMethod,
      },
      description: `PokeMarket: ${data.cardName}`,
    });
    paymentIntentId = paymentIntent.id;
    clientSecret = paymentIntent.client_secret!;
  }

  // 7. Write order doc (status='awaiting_payment' — webhook will flip to 'paid')
  await orderRef.set({
    id: orderId,
    buyerId,
    sellerId: data.sellerId,
    cardId: data.cardId,
    listingId: listingRef.id,
    cardName: listing.cardName ?? data.cardName ?? '',
    cardSet: listing.card?.set?.name ?? listing.cardSet ?? '',
    cardImageUrl: listing.imageUrl ?? listing.card?.imageUrl ?? '',
    cardPriceHkd,
    amountHkd: cardPriceHkd,
    deliveryFeeHkd,
    buyerTotalHkd,
    platformFeeHkd: fee.platformFeeHkd,
    stripeFeeHkd: fee.stripeFeeHkd,
    totalFeeHkd: fee.totalFeeHkd,
    sellerNetHkd: fee.sellerNetHkd,
    deliveryMethod: data.deliveryMethod,
    paymentIntentId,
    paymentRail: rail,
    clientSecret,
    sellerStripeAccountId,
    status: 'awaiting_payment',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  // 8. Return
  return {
    orderId,
    clientSecret,
    paymentIntentId,
    paymentRail: rail,
    amount: buyerTotalHkd,
    cardPrice: cardPriceHkd,
    platformFee: fee.platformFeeHkd,
    totalFee: fee.totalFeeHkd,
    sellerNet: fee.sellerNetHkd,
  };
},
);;
