/**
 * Release payment — the buyer confirms the card arrived, and the
 * platform owes the seller the money.
 *
 * Flow:
 *   1. Client calls releasePayment({ orderId })
 *   2. We verify the buyer owns the order and that the order is in a
 *      state where the card can be confirmed received
 *   3. The buyer's pending escrow goes down by what they actually paid
 *   4. The seller's balance goes up by the net amount
 *   5. The charge the money came from is recorded, so that a later
 *      withdrawal can name it
 *   6. Transaction records are written for both sides
 *
 * The money itself does not move here. The charge sits on the
 * platform account; the seller's balance is the platform's ledger of
 * what it owes them; and the actual transfer happens when the seller
 * withdraws. Moving money at release and again at withdrawal would
 * pay the seller twice.
 */

import * as functions from 'firebase-functions/v2/https';
import { stripeSecretKey } from '../shared/stripe';
import * as admin from 'firebase-admin';

import { FieldValue } from 'firebase-admin/firestore';
const db = admin.firestore();

export const releasePayment = functions.onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
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

  // What the buyer paid, and what the seller is owed. Both come from
  // the order document, which the server wrote — the client cannot
  // influence either number here.
  const buyerPaidHkd = Number(order.buyerTotalHkd ?? order.amountHkd ?? 0);
  const releaseAmountHkd = Number(
    order.sellerNetHkd ?? order.amountHkd - (order.platformFeeHkd ?? 0),
  );
  const now = FieldValue.serverTimestamp();

  // The release is one thing that happens, not four. The order's
  // status, both wallets and the payout source are written in one
  // transaction: a buyer who taps the button twice, or a write that
  // fails half way, must not leave the seller's balance credited
  // twice or the buyer's escrow debited without the money moving.
  const buyerWalletRef = db.doc(`users/${buyerId}/wallet/main`);
  const sellerWalletRef = db.doc(`users/${order.sellerId}/wallet/main`);
  const sourceRef = db.collection('payout_sources').doc();

  try {
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(orderRef);
      const current = fresh.data() as any;
      if (!current) {
        throw new Error('訂單不存在');
      }
      if (!['shipped', 'confirmed', 'pending_release'].includes(current.status)) {
        // Already released, or not ready. The status check inside the
        // transaction is what makes a second call a no-op.
        throw new Error(
          `訂單狀態 ${current.status} 不允許確認收貨`,
        );
      }

      tx.update(orderRef, {
        status: 'released',
        releasedAt: now,
        updatedAt: now,
      });

      tx.set(
        buyerWalletRef,
        {
          pendingEscrow: FieldValue.increment(-buyerPaidHkd),
          updatedAt: now,
        },
        { merge: true },
      );
      tx.set(
        sellerWalletRef,
        {
          balance: FieldValue.increment(releaseAmountHkd),
          updatedAt: now,
        },
        { merge: true },
      );

      // Record where this money came from. A withdrawal can then name
      // the charge it draws against, which is what lets Stripe move
      // money that has not cleared yet. Stripe's source_transaction
      // wants the CHARGE id — a payment intent id is not one.
      tx.create(sourceRef, {
        id: sourceRef.id,
        sellerId: order.sellerId,
        orderId,
        paymentIntentId: order.paymentIntentId ?? null,
        chargeId: order.chargeId ?? null,
        amountHkd: releaseAmountHkd,
        remainingHkd: releaseAmountHkd,
        createdAt: now,
      });
    });
  } catch (err: any) {
    throw new functions.HttpsError(
      'failed-precondition',
      err?.message ?? '放款失敗',
    );
  }

  // Write transaction records
  await db.collection(`users/${buyerId}/transactions`).add({
    type: 'buy',
    cardName: order.cardName,
    cardImage: order.cardImageUrl,
    counterparty: order.sellerName ?? `Seller ${order.sellerId.slice(0, 6)}`,
    amount: buyerPaidHkd,
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

  return {
    orderId,
    status: 'released',
    releasedAmount: releaseAmountHkd,
    // The money has not left the platform yet — it leaves when the
    // seller withdraws. Saying so keeps the two apart in the client.
    transferId: null as string | null,
    payoutPending: true,
  };
},
);;
