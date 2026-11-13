/**
 * Release payment — buyer confirms receipt, funds release from
 * platform escrow to seller's connected account.
 *
 * Flow:
 *   1. Client calls releasePayment({ orderId })
 *   2. We verify buyer owns the order and order status is in
 *      ['shipped', 'confirmed'] (not 'paid' alone — must be confirmed receipt)
 *   3. Read order.paymentIntentId and amount
 *   4. Create Stripe Transfer to seller's connected account,
 *      OR for Stripe Connect destination charges, the funds are
 *      already in seller's account when PaymentIntent succeeds
 *      (with `transfer_data.destination`). For those, "release" is
 *      just a status update.
 *   5. Update orders/{orderId} status='released', releasedAt=now
 *   6. Adjust buyer wallet pendingEscrow -= amount
 *   7. Adjust seller wallet balance += sellerNet
 *   8. Write a transactions/{txId} record for both buyer (purchase) and
 *      seller (sale) so the wallet history shows the activity
 */

import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { FieldValue } from 'firebase-admin/firestore';
const db = admin.firestore();

export const releasePayment = functions.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.HttpsError('unauthenticated', '需要登入');
  }
  const buyerId = request.auth.uid;
  const { orderId } = request.data as { orderId: string };
  if (!orderId) {
    throw new functions.HttpsError('invalid-argument', '缺少 orderId');
  }

  const orderRef = db.doc(`orders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new functions.HttpsError('not-found', '訂單不存在');
  }
  const order = orderSnap.data() as any;

  // Verify buyer
  if (order.buyerId !== buyerId) {
    throw new functions.HttpsError('permission-denied', '只有買家可以確認收貨');
  }
  // Verify status
  if (!['shipped', 'confirmed', 'pending_release'].includes(order.status)) {
    throw new functions.HttpsError(
      'failed-precondition',
      `訂單狀態 ${order.status} 不允許確認收貨`,
    );
  }

  // For destination charges, the funds auto-arrived at seller's account
  // when payment_intent.succeeded fired. The release here is bookkeeping
  // only — update the order status and write wallet transactions.
  // For separate-charges-and-transfers model, you'd call stripe.transfers.create here.

  const releaseAmountHkd = order.sellerNetHkd ?? order.amountHkd - (order.platformFeeHkd ?? 0);
  const now = FieldValue.serverTimestamp();

  await orderRef.update({
    status: 'released',
    releasedAt: now,
    updatedAt: now,
  });

  // Update wallets
  const buyerWalletRef = db.doc(`users/${buyerId}/wallet/main`);
  const sellerWalletRef = db.doc(`users/${order.sellerId}/wallet/main`);
  await buyerWalletRef.set({
    pendingEscrow: FieldValue.increment(-order.amountHkd),
  }, { merge: true });
  await sellerWalletRef.set({
    balance: FieldValue.increment(releaseAmountHkd),
  }, { merge: true });

  // Write transaction records
  await db.collection(`users/${buyerId}/transactions`).add({
    type: 'buy',
    cardName: order.cardName,
    cardImage: order.cardImageUrl,
    counterparty: order.sellerName ?? `Seller ${order.sellerId.slice(0, 6)}`,
    amount: order.amountHkd,
    state: 'released',
    orderId,
    createdAt: now,
  });
  await db.collection(`users/${order.sellerId}/transactions`).add({
    type: 'sell',
    cardName: order.cardName,
    cardImage: order.cardImageUrl,
    counterparty: `Buyer ${buyerId.slice(0, 6)}`,
    amount: releaseAmountHkd,
    state: 'released',
    orderId,
    createdAt: now,
  });

  return { orderId, status: 'released', releasedAmount: releaseAmountHkd };
});
