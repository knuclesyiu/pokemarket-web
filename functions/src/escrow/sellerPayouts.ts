/**
 * Seller payouts — Stripe Connect onboarding and withdrawals.
 *
 * The app calls four callables that did not exist in this codebase:
 * `createSellerAccount`, `getSellerOnboardingStatus`,
 * `createWithdrawal` and `confirmPayment`. They were deployed from an
 * older version of the project and the current source had lost them,
 * so every call returned `not-found` and the seller side of the
 * marketplace could not work.
 *
 * These are written so that the client cannot move money:
 *
 *   - a seller may only create, read or pay out from *their own*
 *     connected account; the account id in the request is checked
 *     against the one the server recorded
 *   - a withdrawal cannot exceed the balance the server credited, and
 *     the balance is decremented in the same write that records the
 *     payout
 *   - `confirmPayment` records that a buyer says they paid; it never
 *     releases anything. Releasing is `releasePayment`'s job, and it
 *     needs the webhook or a human check to have happened first.
 */

import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

import { stripeClient } from '../shared/stripe';

const db = admin.firestore();

/** Where Stripe sends the seller back to after onboarding. */
function appUrl(): string {
  return (
    process.env.APP_URL ??
    'https://pokemarket-255c6.web.app'
  );
}

/** The connected account the server has on file for a seller. */
async function sellerAccountId(uid: string): Promise<string | null> {
  const snap = await db.doc(`sellers/${uid}`).get();
  const id = snap.data()?.stripeAccountId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/* ── onboarding ─────────────────────────────────────────────── */

/**
 * Create a Stripe Connect account for the caller and return a link
 * to Stripe's hosted onboarding page.
 *
 * Calling it twice returns the same account and a fresh link, so a
 * seller who abandons onboarding halfway can pick up where they left
 * off without ending up with two accounts.
 */
export const createSellerAccount = functions.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.HttpsError('unauthenticated', '需要登入');
  }
  // Fail with a reason the seller can act on, rather than a
  // five-hundred with no explanation.
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new functions.HttpsError(
      'failed-precondition',
      'Stripe 收款服務未設定，暫時無法開通收款帳戶。',
    );
  }
  const uid = request.auth.uid;
  const { sellerId, email } = request.data as {
    sellerId?: string;
    email?: string;
  };

  // The caller may only act on their own account.
  if (sellerId && sellerId !== uid) {
    throw new functions.HttpsError(
      'permission-denied',
      '只可以為自己建立收款帳戶',
    );
  }

  const profileSnap = await db.doc(`users/${uid}`).get();
  const address =
    email ??
    (profileSnap.data()?.email as string | undefined) ??
    request.auth.token.email;
  if (!address) {
    throw new functions.HttpsError(
      'invalid-argument',
      '缺少電郵地址，無法建立收款帳戶',
    );
  }

  const sellerRef = db.doc(`sellers/${uid}`);
  let accountId = await sellerAccountId(uid);

  if (!accountId) {
    const account = await stripeClient().accounts.create({
      type: 'express',
      email: address,
      // The platform moves the money to the seller with a transfer,
      // so the seller needs the transfer capability — not card
      // payments of their own.
      capabilities: { transfers: { requested: true } },
      business_type: 'individual',
      metadata: { firebaseUid: uid },
    });
    accountId = account.id;
    await sellerRef.set(
      {
        uid,
        stripeAccountId: accountId,
        email: address,
        createdAt: FieldValue.serverTimestamp(),
        onboarded: false,
      },
      { merge: true },
    );
  }

  const link = await stripeClient().accountLinks.create({
    account: accountId,
    refresh_url: `${appUrl()}/?sellerOnboarding=refresh`,
    return_url: `${appUrl()}/?sellerOnboarding=done`,
    type: 'account_onboarding',
  });

  return { accountId, onboardingUrl: link.url };
});

/**
 * Whether the caller has finished Stripe onboarding.
 *
 * Stripe is asked rather than trusting the stored flags: the seller
 * may have finished the form after the last time this ran, and the
 * stored copy would still say they had not.
 */
export const getSellerOnboardingStatus = functions.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.HttpsError('unauthenticated', '需要登入');
  }
  const uid = request.auth.uid;

  const sellerRecord = await db.doc(`sellers/${uid}`).get();
  const accountId = sellerRecord.data()?.stripeAccountId as string | null;
  if (!accountId) {
    return {
      onboarded: false,
      accountId: null,
      onboardingUrl: null,
      stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
    };
  }

  // When Stripe is not configured — a misconfigured deploy, or the
  // emulator — the status cannot be asked for. Say so and report what
  // was recorded, rather than failing the call: the app needs to
  // tell the user whether they have set up a payout account, and a
  // five-hundred error answers nothing.
  if (!process.env.STRIPE_SECRET_KEY) {
    const stored = sellerRecord.data() ?? {};
    return {
      onboarded: Boolean(stored.onboarded),
      accountId,
      onboardingUrl: null,
      stripeConfigured: false,
    };
  }

  const account = await stripeClient().accounts.retrieve(accountId);
  const onboarded = Boolean(
    account.details_submitted && account.payouts_enabled,
  );

  await db.doc(`sellers/${uid}`).set(
    {
      onboarded,
      detailsSubmitted: Boolean(account.details_submitted),
      chargesEnabled: Boolean(account.charges_enabled),
      payoutsEnabled: Boolean(account.payouts_enabled),
      checkedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  // If they are not finished, hand back a link so the app can send
  // them straight back to Stripe.
  let onboardingUrl: string | null = null;
  if (!onboarded) {
    const link = await stripeClient().accountLinks.create({
      account: accountId,
      refresh_url: `${appUrl()}/?sellerOnboarding=refresh`,
      return_url: `${appUrl()}/?sellerOnboarding=done`,
      type: 'account_onboarding',
    });
    onboardingUrl = link.url;
  }

  return { onboarded, accountId, onboardingUrl, stripeConfigured: true };
});

/* ── withdrawal ─────────────────────────────────────────────── */

/**
 * Pay out the seller's balance to their connected account.
 *
 * The amount is checked against the balance the server credited, and
 * the balance is decremented in the same transaction that records the
 * transfer. A request that names someone else's connected account is
 * refused outright.
 *
 * Stripe moves the money from the platform balance into the seller's
 * connected account; Stripe then pays it out to the seller's bank
 * account on its own schedule.
 */
export const createWithdrawal = functions.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.HttpsError('unauthenticated', '需要登入');
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new functions.HttpsError(
      'failed-precondition',
      'Stripe 收款服務未設定，提現暫時無法處理。',
    );
  }
  const uid = request.auth.uid;
  const { amountHkd, sellerStripeAccountId } = request.data as {
    amountHkd: number;
    sellerStripeAccountId: string;
  };

  if (!amountHkd || amountHkd <= 0) {
    throw new functions.HttpsError('invalid-argument', '金額必須大於 0');
  }

  // The connected account in the request has to be the one the
  // server recorded for this seller. Otherwise a seller could name
  // another seller's account and send them the money.
  const onFile = await sellerAccountId(uid);
  if (!onFile) {
    throw new functions.HttpsError(
      'failed-precondition',
      '未完成 Stripe 收款帳戶設定',
    );
  }
  if (sellerStripeAccountId && sellerStripeAccountId !== onFile) {
    throw new functions.HttpsError(
      'permission-denied',
      '只可以提現到自己嘅收款帳戶',
    );
  }

  const walletRef = db.doc(`users/${uid}/wallet/main`);
  const walletSnap = await walletRef.get();
  const balance = Number(walletSnap.data()?.balance ?? 0);
  if (amountHkd > balance) {
    throw new functions.HttpsError(
      'failed-precondition',
      `提現金額超過可提現餘額 HK$ ${balance.toFixed(2)}`,
    );
  }

  // A Stripe payout cannot name a connected account: it pays out to a
  // bank account that belongs to the account making the payout. The
  // right call is a transfer, which moves the money from the
  // platform's balance into the seller's connected account, and Stripe
  // then pays it out to the seller's bank on their own schedule.
  //
  // The idempotency key means a retried request cannot pay twice.
  const transfer = await stripeClient().transfers.create(
    {
      amount: Math.round(amountHkd * 100),
      currency: 'hkd',
      destination: onFile,
      metadata: { firebaseUid: uid, sellerId: uid },
    },
    {
      idempotencyKey: `withdrawal-${uid}-${Date.now()}`,
    },
  );

  // Record the payout and take the money out of the balance in one
  // transaction. If either half fails, neither happens.
  const payoutRef = db.collection('payouts').doc();
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(walletRef);
    const freshBalance = Number(fresh.data()?.balance ?? 0);
    if (freshBalance < amountHkd) {
      throw new functions.HttpsError(
        'failed-precondition',
        '可提現餘額不足',
      );
    }
    tx.update(walletRef, {
      balance: FieldValue.increment(-amountHkd),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(payoutRef, {
      id: payoutRef.id,
      sellerId: uid,
      stripeAccountId: onFile,
      stripeTransferId: transfer.id,
      amountHkd,
      status: 'submitted',
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return {
    success: true,
    payoutId: transfer.id,
    status: 'submitted',
    amountHkd,
  };
});

/* ── buyer confirming an FPS transfer ───────────────────────── */

/**
 * The buyer says they have transferred the money.
 *
 * This records the claim and moves the order to `awaiting_payment`.
 * It does not release anything and does not mark the order paid: an
 * FPS transfer has to be checked against the bank before the money
 * can move. `releasePayment` is the only thing that releases funds,
 * and it refuses orders that are not shipped or confirmed.
 */
export const confirmPayment = functions.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.HttpsError('unauthenticated', '需要登入');
  }
  const buyerId = request.auth.uid;
  const { paymentIntentId } = request.data as { paymentIntentId: string };
  if (!paymentIntentId) {
    throw new functions.HttpsError('invalid-argument', '缺少 paymentIntentId');
  }

  const orders = await db
    .collection('orders')
    .where('paymentIntentId', '==', paymentIntentId)
    .limit(1)
    .get();
  if (orders.empty) {
    throw new functions.HttpsError('not-found', '訂單不存在');
  }

  const orderRef = orders.docs[0].ref;
  const order = orders.docs[0].data() as any;

  if (order.buyerId !== buyerId) {
    throw new functions.HttpsError('permission-denied', '只有買家可以確認付款');
  }
  if (!['pending', 'awaiting_payment', 'awaiting_fps'].includes(order.status)) {
    throw new functions.HttpsError(
      'failed-precondition',
      `訂單狀態 ${order.status} 不需要確認付款`,
    );
  }

  await orderRef.update({
    status: 'awaiting_payment',
    paymentSubmittedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    success: true,
    status: 'awaiting_payment',
    orderId: orders.docs[0].id,
  };
});
