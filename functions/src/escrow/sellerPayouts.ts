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

import {
  stripeClient,
  stripeSecretKey,
  stripeV2,
  recipientCapabilities,
} from '../shared/stripe';

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
export const createSellerAccount = functions.onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
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
    let account: { id: string };
    try {
      // The v2 API, because the v1 one does not work here.
      //
      // A marketplace platform has to create its sellers with a
      // `recipient` configuration carrying the
      // `stripe_balance.stripe_transfers` capability. The v1
      // equivalent — `capabilities: { transfers: { requested: true } }`
      // — is accepted and then ignored: the account comes back with
      // the capability `inactive`, no error is raised, and the failure
      // only appears much later as a refused transfer. With
      // `fees_collector` and `losses_collector` set to `application`,
      // the platform keeps the fees and carries the risk, which is
      // what holding the buyer's money in escrow means.
      account = await stripeV2<{ id: string }>('/v2/core/accounts', {
        contact_email: address,
        display_name: address,
        identity: {
          country: 'HK',
          entity_type: 'individual',
        },
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: { stripe_transfers: { requested: true } },
            },
          },
        },
        defaults: {
          responsibilities: {
            fees_collector: 'application',
            losses_collector: 'application',
          },
        },
        dashboard: 'express',
        metadata: { firebaseUid: uid },
        include: ['configuration.recipient', 'requirements'],
      });
    } catch (err: any) {
      // Stripe refuses to create a connected account until the
      // platform has signed up for Connect. That is a dashboard
      // setting, and the seller cannot fix it — so say so plainly
      // instead of returning a five-hundred.
      const message = String(err?.message ?? '');
      if (/signed up for Connect/i.test(message)) {
        throw new functions.HttpsError(
          'failed-precondition',
          '平台未開通 Stripe Connect，需要管理員到 dashboard 開通先可以開通賣家收款帳戶。',
        );
      }
      throw new functions.HttpsError(
        'internal',
        `開通收款帳戶失敗：${message.slice(0, 160)}`,
      );
    }
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

  // The v1 account-links endpoint refuses a v2 account outright, so
  // the link comes from the v2 one. `configurations` tells Stripe
  // which of the account's configurations the form is for.
  const link = await stripeV2('/v2/core/account_links', {
    account: accountId,
    use_case: {
      type: 'account_onboarding',
      account_onboarding: {
        refresh_url: `${appUrl()}/?sellerOnboarding=refresh`,
        return_url: `${appUrl()}/?sellerOnboarding=done`,
        configurations: ['recipient'],
      },
    },
  });

  return { accountId, onboardingUrl: (link as any).url };
},
);;

/**
 * Whether the caller has finished Stripe onboarding.
 *
 * Stripe is asked rather than trusting the stored flags: the seller
 * may have finished the form after the last time this ran, and the
 * stored copy would still say they had not.
 */
export const getSellerOnboardingStatus = functions.onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
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

  // The v2 API, because the account was created with it. The v1 view
  // of a v2 account reports `transfers: inactive` no matter what the
  // seller has done, so it cannot answer the question.
  const account = await stripeV2(
    `/v2/core/accounts/${accountId}` +
      '?include=configuration.recipient&include=requirements',
  );
  const caps = recipientCapabilities(account);
  const transfersStatus = caps.stripe_transfers?.status;
  const payoutsStatus = caps.payouts?.status;

  // The seller is ready when the money can move both ways: the
  // platform can transfer into their balance, and that balance can be
  // paid out to their bank. Until the seller has given Stripe their
  // identity and a bank account, the capability is `restricted` and
  // a transfer would be refused.
  const onboarded = transfersStatus === 'active' && payoutsStatus === 'active';

  // What is still missing, in the seller's own words.
  const outstanding: string[] = (
    (account as any)?.requirements?.entries ?? []
  )
    .map((e: any) => e.description as string)
    .filter((d: unknown): d is string => typeof d === 'string');

  await db.doc(`sellers/${uid}`).set(
    {
      onboarded,
      detailsSubmitted: outstanding.length === 0,
      chargesEnabled: false,
      payoutsEnabled: payoutsStatus === 'active',
      transfersEnabled: transfersStatus === 'active',
      outstandingRequirements: outstanding,
      checkedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  // If they are not finished, hand back a link so the app can send
  // them straight back to Stripe.
  let onboardingUrl: string | null = null;
  if (!onboarded) {
    const link = await stripeV2('/v2/core/account_links', {
      account: accountId,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          refresh_url: `${appUrl()}/?sellerOnboarding=refresh`,
          return_url: `${appUrl()}/?sellerOnboarding=done`,
          configurations: ['recipient'],
        },
      },
    });
    onboardingUrl = (link as any).url;
  }

  return { onboarded, accountId, onboardingUrl, stripeConfigured: true };
},
);;

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
export const createWithdrawal = functions.onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
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

  // Which charges this money came from. Naming one as the source lets
  // Stripe move the money before it has cleared, so the platform does
  // not have to hold a float of its own. Only a single source that
  // covers the whole amount can be named — Stripe takes the whole
  // charge against the transfer, not part of it.
  const sourcesSnap = await db
    .collection('payout_sources')
    .where('sellerId', '==', uid)
    .where('remainingHkd', '>', 0)
    .orderBy('createdAt', 'asc')
    .limit(5)
    .get();
  const sources = sourcesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const exactSource = sources.find(
    (src) =>
      Math.abs(Number(src.remainingHkd) - amountHkd) < 0.005 &&
      // Stripe's source_transaction is a CHARGE id. A payment intent
      // id is not one, and passing it fails the transfer.
      (src.chargeId ?? null) !== null,
  );

  // A Stripe payout cannot name a connected account: it pays out to a
  // bank account that belongs to the account making the payout. The
  // right call is a transfer, which moves the money from the
  // platform's balance into the seller's connected account, and Stripe
  // then pays it out to the seller's bank on their own schedule.
  //
  // The idempotency key means a retried request cannot pay twice.
  let transfer;
  try {
    transfer = await stripeClient().transfers.create(
      {
        amount: Math.round(amountHkd * 100),
        currency: 'hkd',
        destination: onFile,
        ...(exactSource ? { source_transaction: exactSource.chargeId } : {}),
        metadata: { firebaseUid: uid, sellerId: uid },
      },
      {
        idempotencyKey: `withdrawal-${uid}-${Date.now()}`,
      },
    );
  } catch (err: any) {
    // Stripe refuses a transfer the platform's balance cannot cover —
    // typically because the buyer's payment has not cleared yet. That
    // is worth saying plainly rather than passing the raw message on.
    const message = String(err?.message ?? '');
    if (/insufficient funds|balance/i.test(message)) {
      throw new functions.HttpsError(
        'failed-precondition',
        '平台資金未清算，請稍後再試',
      );
    }
    throw new functions.HttpsError(
      'internal',
        `提現失敗：${message.slice(0, 160)}`,
    );
  }

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
      sourceTransaction: exactSource?.chargeId ?? null,
      amountHkd,
      status: 'submitted',
      createdAt: FieldValue.serverTimestamp(),
    });

    // Mark the charges this money came from as used, so the same
    // money cannot be named as the source of a second transfer.
    let left = amountHkd;
    for (const src of sources) {
      if (left <= 0.005) break;
      const srcRef = db.doc(`payout_sources/${src.id}`);
      const take = Math.min(Number(src.remainingHkd), left);
      tx.update(srcRef, {
        remainingHkd: FieldValue.increment(-take),
        spentByPayoutId: payoutRef.id,
        updatedAt: FieldValue.serverTimestamp(),
      });
      left -= take;
    }
  });

  return {
    success: true,
    payoutId: transfer.id,
    status: 'submitted',
    amountHkd,
  };
},
);;

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
