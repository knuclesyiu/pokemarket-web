/**
 * PokeMarket — Firebase Cloud Functions
 * Stripe Connect Escrow Integration
 *
 * Flow:
 *  1. Buyer pays → PaymentIntent created, funds HELD
 *  2. Seller ships / meets up
 *  3. Buyer confirms → Cloud Function transfers to seller
 *  4. Dispute → Funds frozen until resolution
 *
 * Deploy: firebase deploy --only functions
 *
 * ⚠️ DEPRECATION NOTICE (March 2026):
 * functions.config() deprecated → migrated to dotenv (.env file)
 */

require("dotenv").config({ path: __dirname + "/../../.env" });
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const cors = require("cors")({ origin: true });

admin.initializeApp();
const db = admin.firestore();

// ────────────────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────────────────

const PLATFORM_FEE_PERCENT = 0.03; // 3%

/**
 * Calculate platform fee and seller net from gross amount (HKD cents)
 */
function splitAmount(grossHkdCents) {
  const platformFee = Math.round(grossHkdCents * PLATFORM_FEE_PERCENT);
  const sellerNet = grossHkdCents - platformFee;
  return { platformFee, sellerNet };
}

/**
 * Get or create a Stripe Connect Express account for a seller.
 * Returns existing account_id if already onboarded.
 */
async function getOrCreateConnectAccount(sellerId, sellerEmail) {
  const sellerRef = db.collection("sellers").doc(sellerId);
  const sellerDoc = await sellerRef.get();

  if (sellerDoc.exists && sellerDoc.data().stripeAccountId) {
    return sellerDoc.data().stripeAccountId;
  }

  // Create new Stripe Connect Express account
  const account = await stripe.accounts.create({
    type: "express",
    email: sellerEmail,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_type: "individual",
    metadata: { sellerId },
  });

  await sellerRef.set(
    {
      stripeAccountId: account.id,
      onboardedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return account.id;
}

/**
 * Create Stripe Connect onboarding link for a seller.
 */
async function createOnboardingLink(accountId, sellerId) {
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `https://pokemarket.app/seller/onboarding?refresh=1`,
    return_url: `https://pokemarket.app/seller/dashboard?onboarded=1`,
    type: "account_onboarding",
  });
  return accountLink.url;
}

// ────────────────────────────────────────────────────────────────────────────
// 1. CREATE PAYMENT INTENT (Escrow Hold)
// Called from RN App → CheckoutScreen
// ────────────────────────────────────────────────────────────────────────────

/**
 * POST /createPaymentIntent
 * Body: { orderId, amountHkd, sellerId, buyerId, deliveryMethod, cardName, cardId }
 *
 * Creates a Stripe PaymentIntent with funds collected and held on platform account.
 * Funds are NOT automatically transferred — they stay in escrow.
 *
 * For FPS: Creates a PaymentIntent with fps Hong Kong bank account.
 * For Card: Creates PaymentIntent with card payment.
 */
exports.createPaymentIntent = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be logged in");
  }

  const { orderId, amountHkd, sellerId, deliveryMethod, cardName, cardId } = data;

  if (!orderId || !amountHkd || !sellerId) {
    throw new functions.https.HttpsError("invalid-argument", "Missing required fields");
  }

  // Convert HKD to smallest currency unit (cents)
  const amountCents = Math.round(amountHkd * 100);
  const { platformFee, sellerNet } = splitAmount(amountCents);

  // Create PaymentIntent with manual capture (escrow = hold funds, don't auto-transfer)
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: "hkd",
    capture_method: "manual", // ⭐ KEY: funds captured but NOT transferred — escrow mode
    metadata: {
      orderId,
      buyerId: context.auth.uid,
      sellerId,
      cardName: cardName || "",
      cardId: cardId || "",
      deliveryMethod: deliveryMethod || "meetup",
      platformFee: String(platformFee),
      sellerNet: String(sellerNet),
    },
    description: `PokeMarket — ${cardName} — Order ${orderId}`,
    receipt_email: undefined, // set if buyer email available
  });

  // Save order to Firestore
  await db.collection("orders").doc(orderId).set({
    orderId,
    buyerId: context.auth.uid,
    sellerId,
    cardName,
    cardId,
    amountHkd,
    amountCents,
    platformFee,
    sellerNet,
    deliveryMethod,
    status: "payment_pending",
    paymentIntentId: paymentIntent.id,
    stripeAccountId: null, // filled when seller is paid
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    amount: amountCents,
    platformFee,
    sellerNet,
  };
});

// ────────────────────────────────────────────────────────────────────────────
// 2. CONFIRM PAYMENT (buyer paid — funds now in escrow)
// Called from RN App after buyer completes FPS / card payment
// ────────────────────────────────────────────────────────────────────────────

/**
 * POST /confirmPayment
 * Body: { paymentIntentId, paymentMethodId }
 *
 * Captures the PaymentIntent — funds move from "authorized" to "held in platform account".
 * After this, the platform holds the money until release or refund.
 */
exports.confirmPayment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be logged in");
  }

  const { paymentIntentId } = data;

  try {
    // Capture the payment (funds now in platform account = escrowed)
    const pi = await stripe.paymentIntents.capture(paymentIntentId);

    await db.collection("orders").doc(pi.metadata.orderId).update({
      status: "funds_escrowed",
      capturedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      status: pi.status, // should be "succeeded"
      orderId: pi.metadata.orderId,
    };
  } catch (err) {
    throw new functions.https.HttpsError("internal", `Capture failed: ${err.message}`);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// 3. RELEASE PAYMENT (buyer confirmed receipt)
// Called from RN App → OrderStatusScreen "確認收貨" button
// Transfers funds from platform → seller's Stripe Connect account
// ────────────────────────────────────────────────────────────────────────────

/**
 * POST /releasePayment
 * Body: { orderId, sellerStripeAccountId }
 *
 * Transfers escrowed funds to seller (minus platform fee).
 * This is triggered MANUALLY by buyer confirmation — no auto-transfer.
 */
exports.releasePayment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be logged in");
  }

  const { orderId, sellerStripeAccountId } = data;

  const orderRef = db.collection("orders").doc(orderId);
  const order = await orderRef.get();

  if (!order.exists) {
    throw new functions.https.HttpsError("not-found", "Order not found");
  }

  const orderData = order.data();

  // Verify buyer is releasing (only the buyer can confirm receipt)
  if (orderData.buyerId !== context.auth.uid) {
    throw new functions.https.HttpsError("permission-denied", "Only buyer can release funds");
  }

  if (orderData.status !== "funds_escrowed") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Cannot release — order status is "${orderData.status}"`
    );
  }

  if (!sellerStripeAccountId) {
    throw new functions.https.HttpsError("invalid-argument", "Seller Stripe account ID required");
  }

  // Transfer to seller's Stripe Connect account
  const transfer = await stripe.transfers.create({
    amount: orderData.sellerNet,
    currency: "hkd",
    destination: sellerStripeAccountId,
    source_transaction: orderData.paymentIntentId, // links to the captured charge
    metadata: {
      orderId,
      buyerId: orderData.buyerId,
      platformFee: String(orderData.platformFee),
    },
    description: `PokeMarket — Sale proceeds — ${orderData.cardName}`,
  });

  // Update order status
  await orderRef.update({
    status: "funds_released",
    transferId: transfer.id,
    releasedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    success: true,
    transferId: transfer.id,
    amountTransferred: orderData.sellerNet,
    orderId,
  };
});

// ────────────────────────────────────────────────────────────────────────────
// 4. SELLER ONBOARDING (Stripe Connect Express)
// Called when seller first tries to list a card
// ────────────────────────────────────────────────────────────────────────────

/**
 * POST /createSellerAccount
 * Body: { sellerId, email }
 *
 * Creates Stripe Connect Express account + returns onboarding URL.
 */
exports.createSellerAccount = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be logged in");
  }

  const { email } = data;
  const sellerId = context.auth.uid;

  const accountId = await getOrCreateConnectAccount(sellerId, email);
  const onboardingUrl = await createOnboardingLink(accountId, sellerId);

  return { onboardingUrl, accountId };
});

/**
 * GET /getSellerOnboardingStatus?sellerId=xxx
 * Checks if seller has completed Stripe onboarding.
 */
exports.getSellerOnboardingStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be logged in");
  }

  const sellerId = context.auth.uid;
  const sellerRef = db.collection("sellers").doc(sellerId);
  const sellerDoc = await sellerRef.get();

  if (!sellerDoc.exists || !sellerDoc.data().stripeAccountId) {
    return { onboarded: false, accountId: null };
  }

  const accountId = sellerDoc.data().stripeAccountId;

  // Check if account is fully onboarded
  const account = await stripe.accounts.retrieve(accountId);

  const onboarded =
    account.details_submitted &&
    account.charges_enabled &&
    account.payouts_enabled;

  return {
    onboarded,
    accountId,
    // If not onboarded, provide fresh onboarding link
    onboardingUrl: onboarded ? null : await createOnboardingLink(accountId, sellerId),
  };
});

// ────────────────────────────────────────────────────────────────────────────
// 5. DISPUTE / REFUND (if buyer raises issue)
// Called from RN App → Dispute screen
// ────────────────────────────────────────────────────────────────────────────

/**
 * POST /refundPayment
 * Body: { orderId, reason }
 *
 * Refunds the buyer — only allowed when funds are still escrowed.
 * Platform fee is also reversed.
 */
exports.refundPayment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be logged in");
  }

  const { orderId, reason } = data;
  const orderRef = db.collection("orders").doc(orderId);
  const order = await orderRef.get();

  if (!order.exists) {
    throw new functions.https.HttpsError("not-found", "Order not found");
  }

  const orderData = order.data();

  // Only buyer or platform admin can refund
  if (orderData.buyerId !== context.auth.uid) {
    throw new functions.https.HttpsError("permission-denied", "Not authorized");
  }

  if (!["payment_pending", "funds_escrowed"].includes(orderData.status)) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Cannot refund — order status is "${orderData.status}"`
    );
  }

  if (orderData.paymentIntentId) {
    try {
      // If already captured → refund
      if (orderData.status === "funds_escrowed") {
        const refund = await stripe.refunds.create({
          payment_intent: orderData.paymentIntentId,
          reason: "fraudulent", // buyer dispute
          metadata: { orderId, reason: reason || "buyer_dispute" },
        });

        await orderRef.update({
          status: "refunded",
          refundId: refund.id,
          disputeReason: reason,
          refundedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return { success: true, refundId: refund.id };
      }
    } catch (err) {
      throw new functions.https.HttpsError("internal", `Refund failed: ${err.message}`);
    }
  }

  // Cancel if not yet captured
  if (orderData.status === "payment_pending") {
    await stripe.paymentIntents.cancel(orderData.paymentIntentId);
    await orderRef.update({
      status: "cancelled",
      cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: true, cancelled: true };
  }
});

// ────────────────────────────────────────────────────────────────────────────
// 6. WITHDRAWAL (seller withdraws balance to bank)
// Called from RN App → WalletScreen "提現" button
// ────────────────────────────────────────────────────────────────────────────

/**
 * POST /createWithdrawal
 * Body: { amountHkd, sellerStripeAccountId }
 *
 * Payouts available balance from seller's Stripe Connect account to their bank.
 */
exports.createWithdrawal = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be logged in");
  }

  const { amountHkd, sellerStripeAccountId } = data;
  const sellerId = context.auth.uid;
  const amountCents = Math.round(amountHkd * 100);

  if (!sellerStripeAccountId) {
    throw new functions.https.HttpsError("invalid-argument", "Seller Stripe account required");
  }

  // Check available balance
  const balance = await stripe.balance.retrieve({
    stripeAccount: sellerStripeAccountId,
  });

  const availableHkd = balance.available
    .filter((b) => b.currency === "hkd")
    .reduce((sum, b) => sum + b.amount, 0);

  if (amountCents > availableHkd) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Insufficient balance. Available: HK$${(availableHkd / 100).toFixed(2)}`
    );
  }

  const payout = await stripe.payouts.create(
    {
      amount: amountCents,
      currency: "hkd",
      metadata: { sellerId, source: "pokemarket" },
    },
    { stripeAccount: sellerStripeAccountId }
  );

  // Log withdrawal
  await db.collection("sellers").doc(sellerId).collection("withdrawals").add({
    payoutId: payout.id,
    amountHkd,
    amountCents,
    status: payout.status,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true, payoutId: payout.id, status: payout.status };
});

// ────────────────────────────────────────────────────────────────────────────
// 7. STRIPE WEBHOOK
// Handles async Stripe events (payment succeeded, dispute, etc.)
// ────────────────────────────────────────────────────────────────────────────

/**
 * POST /stripeWebhook
 * Raw body required — configured in Stripe Dashboard → Webhooks
 *
 * Stripe Dashboard → Webhooks → Add endpoint:
 *   URL: https://us-central1-YOUR_PROJECT.cloudfunctions.net/stripeWebhook
 *   Events: payment_intent.succeeded, payment_intent.payment_failed,
 *           charge.refunded, payout.paid
 */
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = functions.config().stripe.webhook_secret;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle event
  switch (event.type) {
    case "payment_intent.succeeded": {
      const pi = event.data.object;
      const orderId = pi.metadata.orderId;
      if (orderId && pi.capture_method === "manual") {
        // This is a captured PaymentIntent — funds now in escrow
        await db.collection("orders").doc(orderId).update({
          status: "funds_escrowed",
          stripeChargeId: pi.latest_charge,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      break;
    }

    case "payment_intent.payment_failed": {
      const pi = event.data.object;
      const orderId = pi.metadata.orderId;
      if (orderId) {
        await db.collection("orders").doc(orderId).update({
          status: "payment_failed",
          failureMessage: pi.last_payment_error?.message,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      break;
    }

    case "charge.refunded": {
      const charge = event.data.object;
      // Find order by payment intent
      const orders = await db
        .collection("orders")
        .where("paymentIntentId", "==", charge.payment_intent)
        .limit(1)
        .get();

      if (!orders.empty) {
        const orderId = orders.docs[0].id;
        await db.collection("orders").doc(orderId).update({
          status: "refunded",
          refundId: charge.refunds?.data?.[0]?.id,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      break;
    }

    case "payout.paid": {
      // Notify seller their withdrawal arrived
      const payout = event.data.object;
      if (payout.metadata?.sellerId) {
        await db
          .collection("sellers")
          .doc(payout.metadata.sellerId)
          .collection("notifications")
          .add({
            type: "withdrawal_arrived",
            payoutId: payout.id,
            amountHkd: payout.amount / 100,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
          });
      }
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
});

// ────────────────────────────────────────────────────────────────────────────
// 8. AUTO-RELEASE (cron job — if buyer doesn't confirm after X days)
// Runs daily via Firebase Cron
// ────────────────────────────────────────────────────────────────────────────

/**
 * Firebase Cron: every day at 09:00 HKT
 * If buyer hasn't confirmed within 7 days of "funds_escrowed",
 * auto-release to seller and notify both parties.
 *
 * Setup in firebase.json:
 *   {"source": "...", "target": "dailyAutoRelease", "schedule": "every 24 hours"}
 */
exports.dailyAutoRelease = functions.pubsub
  .schedule("every 24 hours")
  .timeZone("Asia/Hong_Kong")
  .onRun(async () => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const staleOrders = await db
      .collection("orders")
      .where("status", "==", "funds_escrowed")
      .where("updatedAt", "<", admin.firestore.Timestamp.fromDate(sevenDaysAgo))
      .get();

    const results = { autoReleased: 0, errors: 0 };

    for (const docSnap of staleOrders.docs) {
      const order = docSnap.data();
      try {
        // Get seller's Stripe account
        const sellerDoc = await db.collection("sellers").doc(order.sellerId).get();
        const stripeAccountId = sellerDoc.data()?.stripeAccountId;

        if (!stripeAccountId) {
          console.log(`Order ${docSnap.id}: no seller Stripe account, skipping`);
          continue;
        }

        // Release to seller
        await stripe.transfers.create({
          amount: order.sellerNet,
          currency: "hkd",
          destination: stripeAccountId,
          source_transaction: order.paymentIntentId,
          description: `PokeMarket Auto-Release — Order ${docSnap.id} (7-day auto)`,
        });

        await docSnap.ref.update({
          status: "funds_released",
          autoReleased: true,
          releasedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        results.autoReleased++;
      } catch (err) {
        console.error(`Auto-release failed for ${docSnap.id}: ${err.message}`);
        results.errors++;
      }
    }

    console.log(
      `Daily auto-release complete: ${results.autoReleased} released, ${results.errors} errors`
    );
    return null;
  });
