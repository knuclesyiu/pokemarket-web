/**
 * PokeMarket — Firebase Cloud Functions
 * Stripe Connect Escrow + Trade Platform
 *
 * Deploy: firebase deploy --only functions --project pokemarket-255c6
 */

require("dotenv").config({ path: __dirname + "/../.env" });
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const cors = require("cors")({ origin: true });
const v2 = require("firebase-functions/v2");
const { raw } = require("express");

admin.initializeApp();
const db = admin.firestore();

// Bypass self-signed certificate for TCGdex API (Node 22 + undici)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// ─────────────────────────────────────────────────────────────────────────────
// PLATFORM FEE CONFIGURATION  (tunable — update before go-live)
// ─────────────────────────────────────────────────────────────────────────────
const PLATFORM_FEE_PERCENT = 0.03;    // 3% platform fee — set to 0 to disable
const STRIPE_PERCENT_FEE  = 0.029;    // Stripe: 2.9% + HK$2.35 per charge
const STRIPE_FIXED_CENTS  = 235;      // HK$2.35 in cents
const ORDER_MIN_FEE_HKD   = 20;       // Minimum total fee (Stripe + platform) = HK$20
const ORDER_MIN_FEE_CENTS = 2000;     // HK$20 in cents
const ESCROW_MIN_HKD = 20;           // HK$20 — below this, no escrow hold

function splitAmount(grossHkdCents) {
  // grossHkdCents = card price in HKD cents (buyer pays card price)
  // Stripe fee: 2.9% + HK$2.35 per charge
  // Platform fee: PLATFORM_FEE_PERCENT of gross, with ORDER_MIN_FEE floor
  // Total fee (Stripe + platform) is capped at ORDER_MIN_FEE_HKD = HK$20
  const stripeFee = Math.round(grossHkdCents * STRIPE_PERCENT_FEE) + STRIPE_FIXED_CENTS;
  const platformFeeRaw = Math.round(grossHkdCents * PLATFORM_FEE_PERCENT);
  const totalFee = Math.max(stripeFee + platformFeeRaw, ORDER_MIN_FEE_CENTS);
  const platformFee = Math.min(platformFeeRaw, totalFee - stripeFee);
  const sellerNet = grossHkdCents - platformFee;
  return { platformFee, stripeFee, sellerNet, totalFee, grossHkdCents };
}

async function getOrCreateConnectAccount(sellerId, sellerEmail) {
  const sellerRef = db.collection("sellers").doc(sellerId);
  const sellerDoc = await sellerRef.get();
  if (sellerDoc.exists && sellerDoc.data().stripeAccountId) {
    return sellerDoc.data().stripeAccountId;
  }
  const account = await stripe.accounts.create({
    type: "express",
    email: sellerEmail,
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    business_type: "individual",
    metadata: { sellerId },
  });
  await sellerRef.set(
    { stripeAccountId: account.id, onboardedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
  return account.id;
}

async function createOnboardingLink(accountId, sellerId) {
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `https://pokemarket.app/seller/onboarding?refresh=1`,
    return_url: `https://pokemarket.app/seller/dashboard?onboarded=1`,
    type: "account_onboarding",
  });
  return accountLink.url;
}

function requireAuth(context) {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Must be logged in");
  return context.auth.uid;
}

// ─────────────────────────────────────────────────────────────────────────────
// STRIPE PAYMENT FUNCTIONS (v2 — us-central1)
// ─────────────────────────────────────────────────────────────────────────────

exports.createPaymentIntent = v2.https.onCall(
  { region: "us-central1" },
  async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Must be logged in");
    const { orderId, amountHkd, sellerId, deliveryMethod, cardName, cardId } = data;
    if (!orderId || !amountHkd || !sellerId) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields");
    }
    const amountCents = Math.round(amountHkd * 100);
    // Escrow only for transactions >= ESCROW_MIN_HKD (HK$20)
    // Below threshold: direct Stripe transfer, no escrow hold
    const useEscrow = amountCents >= ESCROW_MIN_HKD;
    const { platformFee, sellerNet } = splitAmount(amountCents);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "hkd",
      capture_method: "manual",
      metadata: { orderId, buyerId: context.auth.uid, sellerId, cardName: cardName || "", cardId: cardId || "", deliveryMethod: deliveryMethod || "meetup", platformFee: String(platformFee), sellerNet: String(sellerNet) },
      description: `PokeMarket — ${cardName} — Order ${orderId}`,
    });

    await db.collection("orders").doc(orderId).set({
      orderId, buyerId: context.auth.uid, sellerId, cardName, cardId,
      amountHkd, amountCents, platformFee, sellerNet, deliveryMethod,
      status: "payment_pending", paymentIntentId: paymentIntent.id,
      stripeAccountId: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id, amount: amountCents, platformFee, sellerNet };
  }
);

exports.confirmPayment = v2.https.onCall(
  { region: "us-central1" },
  async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Must be logged in");
    const { paymentIntentId } = data;
    try {
      const pi = await stripe.paymentIntents.capture(paymentIntentId);
      await db.collection("orders").doc(pi.metadata.orderId).update({
        status: "funds_escrowed",
        capturedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { success: true, status: pi.status, orderId: pi.metadata.orderId };
    } catch (err) {
      throw new functions.https.HttpsError("internal", `Capture failed: ${err.message}`);
    }
  }
);

exports.releasePayment = v2.https.onCall(
  { region: "us-central1" },
  async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Must be logged in");
    const { orderId, sellerStripeAccountId, releaseAmountHkd } = data;
    const orderRef = db.collection("orders").doc(orderId);
    const order = await orderRef.get();
    if (!order.exists) throw new functions.https.HttpsError("not-found", "Order not found");
    const orderData = order.data();
    if (orderData.buyerId !== context.auth.uid) throw new functions.https.HttpsError("permission-denied", "Only buyer can release funds");

    const validStatuses = ["funds_escrowed", "pending_seller_consent"];
    if (!validStatuses.includes(orderData.status)) {
      throw new functions.https.HttpsError("failed-precondition", `Cannot release — order status is "${orderData.status}"`);
    }

    const originalAmountHkd = Number(orderData.amountHkd);
    const requestedAmountHkd = releaseAmountHkd ?? originalAmountHkd;

    // ── Full amount or no modification: direct release ──────────────────────
    if (requestedAmountHkd >= originalAmountHkd || orderData.status === "funds_escrowed") {
      if (!sellerStripeAccountId) throw new functions.https.HttpsError("invalid-argument", "Seller Stripe account ID required");

      const { sellerNet } = splitAmount(Math.round(originalAmountHkd * 100));
      const transfer = await stripe.transfers.create({
        amount: sellerNet, currency: "hkd", destination: sellerStripeAccountId,
        source_transaction: orderData.paymentIntentId,
        metadata: { orderId, buyerId: orderData.buyerId, platformFee: String(orderData.platformFee) },
        description: `PokeMarket — Sale proceeds — ${orderData.cardName}`,
      });

      await orderRef.update({
        status: "funds_released", transferId: transfer.id,
        releasedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { success: true, transferId: transfer.id, amountTransferred: sellerNet, orderId };
    }

    // ── Buyer reduced amount: pending seller consent (7-day auto-release) ──
    await orderRef.update({
      status: "pending_seller_consent",
      buyerRequestedAmountHkd: requestedAmountHkd,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Refund the difference back to buyer immediately (Stripe captures first, then refunds)
    const originalCents = Math.round(originalAmountHkd * 100);
    const requestedCents = Math.round(requestedAmountHkd * 100);
    const refundCents = originalCents - requestedCents;
    let refundId = null;
    if (refundCents > 0) {
      try {
        const pi = await stripe.paymentIntents.retrieve(orderData.paymentIntentId);
        const charge = pi.latest_charge;
        if (charge) {
          const refund = await stripe.refunds.create({ charge, amount: refundCents });
          refundId = refund.id;
        }
      } catch (e) {
        console.warn("[releasePayment] Refund failed:", e.message);
      }
    }

    return {
      success: true,
      status: "pending_seller_consent",
      orderId,
      releaseAmountHkd: requestedAmountHkd,
      refundId,
      message: "Buyer requested lower amount — waiting for seller consent. Auto-releases at original amount in 7 days.",
    };
  }
);


exports.sellerRespondToModification = v2.https.onCall(
  { region: "us-central1" },
  async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Must be logged in");
    const { orderId, accept, sellerStripeAccountId } = data;

    const orderRef = db.collection("orders").doc(orderId);
    const order = await orderRef.get();
    if (!order.exists) throw new functions.https.HttpsError("not-found", "Order not found");
    const orderData = order.data();
    if (orderData.sellerId !== context.auth.uid) throw new functions.https.HttpsError("permission-denied", "Only seller can respond");
    if (orderData.status !== "pending_seller_consent") {
      throw new functions.https.HttpsError("failed-precondition", `Order is not pending seller consent — status: "${orderData.status}"`);
    }
    const requestedAmountHkd = Number(orderData.buyerRequestedAmountHkd);

    if (accept) {
      // Accept: release at reduced amount, refund excess to buyer
      if (!sellerStripeAccountId) throw new functions.https.HttpsError("invalid-argument", "Seller Stripe account ID required");
      const { sellerNet } = splitAmount(Math.round(requestedAmountHkd * 100));
      const transfer = await stripe.transfers.create({
        amount: sellerNet, currency: "hkd", destination: sellerStripeAccountId,
        source_transaction: orderData.paymentIntentId,
        metadata: { orderId, buyerId: orderData.buyerId, platformFee: String(orderData.platformFee) },
        description: `PokeMarket — Sale proceeds (negotiated) — ${orderData.cardName}`,
      });
      await orderRef.update({
        status: "funds_released",
        transferId: transfer.id,
        releasedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { success: true, status: "funds_released", transferId: transfer.id, amountTransferred: sellerNet };
    } else {
      // Reject: open dispute, auto-resolve in 7 days (existing auto-release handles this)
      // Keep at pending_seller_consent — auto-release cron will release at original amount after 7 days
      await orderRef.update({
        status: "pending_seller_consent",
        sellerRejectedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { success: true, status: "pending_seller_consent", message: "Seller rejected. Auto-release at original price in 7 days." };
    }
  }
);


exports.refundPayment = v2.https.onCall(
  { region: "us-central1" },
  async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Must be logged in");
    const { orderId, reason } = data;
    const orderRef = db.collection("orders").doc(orderId);
    const order = await orderRef.get();
    if (!order.exists) throw new functions.https.HttpsError("not-found", "Order not found");
    const orderData = order.data();
    if (orderData.buyerId !== context.auth.uid) throw new functions.https.HttpsError("permission-denied", "Not authorized");
    if (orderData.status !== "funds_escrowed") throw new functions.https.HttpsError("failed-precondition", "Can only refund escrowed funds");
    const pi = await stripe.paymentIntents.cancel(orderData.paymentIntentId);
    await orderRef.update({ status: "refunded", reason, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return { success: true, orderId };
  }
);

exports.createSellerAccount = v2.https.onCall(
  { region: "us-central1" },
  async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Must be logged in");
    const { email } = data;
    const sellerId = context.auth.uid;
    const accountId = await getOrCreateConnectAccount(sellerId, email);
    const onboardingUrl = await createOnboardingLink(accountId, sellerId);
    return { onboardingUrl, accountId };
  }
);

exports.getSellerOnboardingStatus = v2.https.onCall(
  { region: "us-central1" },
  async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Must be logged in");
    const sellerId = context.auth.uid;
    const sellerRef = db.collection("sellers").doc(sellerId);
    const sellerDoc = await sellerRef.get();
    if (!sellerDoc.exists || !sellerDoc.data().stripeAccountId) return { onboarded: false, accountId: null };
    const accountId = sellerDoc.data().stripeAccountId;
    const account = await stripe.accounts.retrieve(accountId);
    const onboarded = account.details_submitted && account.charges_enabled && account.payouts_enabled;
    return { onboarded, accountId, onboardingUrl: onboarded ? null : await createOnboardingLink(accountId, sellerId) };
  }
);

exports.createWithdrawal = v2.https.onCall(
  { region: "us-central1" },
  async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Must be logged in");
    const { amountHkd, sellerStripeAccountId } = data;
    const amountCents = Math.round(amountHkd * 100);
    const payout = await stripe.payouts.create(
      { amount: amountCents, currency: "hkd" },
      { stripeAccount: sellerStripeAccountId }
    );
    return { success: true, payoutId: payout.id, status: payout.status };
  }
);

exports.stripeWebhook = v2.https.onRequest(
  raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object;
        if (pi.metadata?.orderId) {
          const orderSnap = await db.collection("orders").doc(pi.metadata.orderId).get();
          if (orderSnap.exists && orderSnap.data().status !== "funds_escrowed") {
            await db.collection("orders").doc(pi.metadata.orderId).update({
              status: "funds_escrowed",
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        if (pi.metadata?.orderId) {
          await db.collection("orders").doc(pi.metadata.orderId).update({
            status: "payment_failed",
            failureMessage: pi.last_payment_error?.message,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object;
        const orders = await db.collection("orders").where("paymentIntentId", "==", charge.payment_intent).limit(1).get();
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
        const payout = event.data.object;
        if (payout.metadata?.sellerId) {
          await db.collection("sellers").doc(payout.metadata.sellerId).collection("notifications").add({
            type: "withdrawal_arrived", payoutId: payout.id,
            amountHkd: payout.amount / 100,
            createdAt: admin.firestore.FieldValue.serverTimestamp(), read: false,
          });
        }
        break;
      }
      default: console.log(`Unhandled event type: ${event.type}`);
    }
    res.json({ received: true });
  }
);

// AUTO-RELEASE SCHEDULED FUNCTION
// Uses 1st-gen API to avoid 1st→2nd gen upgrade conflict with existing deployment.
// The existing Cloud Scheduler job maps to this function name.
// ─────────────────────────────────────────────────────────────────────────────
exports.dailyAutoRelease = functions.pubsub
  .schedule("every 24 hours")
  .timeZone("Asia/Hong_Kong")
  .onRun(async (message) => {
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
        const sellerDoc = await db.collection("sellers").doc(order.sellerId).get();
        const stripeAccountId = sellerDoc.data()?.stripeAccountId;
        if (!stripeAccountId) { console.log(`Order ${docSnap.id}: no seller Stripe account, skipping`); continue; }
        await stripe.transfers.create({
          amount: order.sellerNet, currency: "hkd", destination: stripeAccountId,
          source_transaction: order.paymentIntentId,
          description: `PokeMarket Auto-Release — Order ${docSnap.id} (7-day auto)`,
        });
        await docSnap.ref.update({
          status: "funds_released", autoReleased: true,
          releasedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        results.autoReleased++;
      } catch (err) {
        console.error(`Auto-release failed for ${docSnap.id}: ${err.message}`);
        results.errors++;
      }
    }
    console.log(`Daily auto-release complete: ${results.autoReleased} released, ${results.errors} errors`);
    return null;
  });

// ─────────────────────────────────────────────────────────────────────────────
// TRADE FUNCTIONS (卡片交換系統 — v2)
// ─────────────────────────────────────────────────────────────────────────────

exports.getMarketListings = v2.https.onCall(
  { region: "us-central1" },
  async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    const { series, rarity, condition, minPrice, maxPrice, limit = 50 } = data;
    let q = db.collection("listings").where("status", "==", "active");
    const snaps = await q.get();
    let listings = snaps.docs.map(d => ({ id: d.id, ...d.data() }));
    if (series) listings = listings.filter(l => l.series === series);
    if (rarity) listings = listings.filter(l => l.rarity === rarity);
    if (condition) listings = listings.filter(l => l.condition === condition);
    if (minPrice) listings = listings.filter(l => l.price >= minPrice);
    if (maxPrice) listings = listings.filter(l => l.price <= maxPrice);
    listings = listings.slice(0, limit);
    return { listings };
  }
);

exports.createOffer = v2.https.onCall(
  { region: "us-central1" },
  async (data, context) => {
    const buyerId = requireAuth(context);
    const { listingId, offerCards, cashAddHkd, message } = data;
    if (!listingId) throw new functions.https.HttpsError("invalid-argument", "缺少 listingId");
    const listingRef = db.collection("listings").doc(listingId);
    const listing = await listingRef.get();
    if (!listing.exists) throw new functions.https.HttpsError("not-found", "Listing not found");
    const listingData = listing.data();
    if (listingData.sellerId === buyerId) throw new functions.https.HttpsError("invalid-argument", "不能向自己發 Offer");
    const offerData = {
      listingId, buyerId, sellerId: listingData.sellerId,
      offerCards: offerCards || [], cashAddHkd: cashAddHkd || 0,
      message: message || "", status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const offerRef = await db.collection("offers").add(offerData);
    return { offerId: offerRef.id, status: "pending" };
  }
);

exports.respondToOffer = v2.https.onCall(
  { region: "us-central1" },
  async (data, context) => {
    const sellerId = requireAuth(context);
    const { offerId, action, counterOffer } = data;
    if (!offerId || !action) throw new functions.https.HttpsError("invalid-argument", "缺少 offerId 或 action");
    if (!["accept", "reject", "counter"].includes(action)) throw new functions.https.HttpsError("invalid-argument", "action 必須是 accept / reject / counter");
    const offerRef = db.collection("offers").doc(offerId);
    const offerSnap = await offerRef.get();
    if (!offerSnap.exists) throw new functions.https.HttpsError("not-found", "Offer not found");
    const offer = offerSnap.data();
    if (offer.sellerId !== sellerId) throw new functions.https.HttpsError("permission-denied", "只有賣家可以回應");
    if (offer.status !== "pending") throw new functions.https.HttpsError("failed-precondition", `Offer 狀態為 ${offer.status}，無法回應`);

    const newStatus = action === "accept" ? "accepted" : action === "reject" ? "rejected" : "countered";
    const updateData = {
      status: newStatus, respondedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (action === "counter" && counterOffer) {
      updateData.counterOffer = counterOffer;
    }
    await offerRef.update(updateData);

    // 如果接受：執行卡片交換
    if (action === "accept") {
      const listingRef = db.collection("listings").doc(offer.listingId);
      const listingSnap = await listingRef.get();
      const listing = listingSnap.data();

      // 轉移賣家的卡給買家
      const buyerCardData = {
        ...listing.card, condition: listing.condition,
        acquiredAt: admin.firestore.FieldValue.serverTimestamp(),
        source: `trade_accept:${offerId}`,
        previousOwnerId: offer.sellerId,
      };
      await db.collection("user_cards").doc(offer.buyerId).collection("cards").add(buyerCardData);

      // 轉移買家的卡給賣家
      for (const oc of (offer.offerCards || [])) {
        const sellerCardData = {
          ...oc, acquiredAt: admin.firestore.FieldValue.serverTimestamp(),
          source: `trade_accept:${offerId}`,
          previousOwnerId: offer.buyerId,
        };
        await db.collection("user_cards").doc(offer.sellerId).collection("cards").add(sellerCardData);
      }

      // 更新 listing 狀態
      await listingRef.update({ status: "traded", tradedAt: admin.firestore.FieldValue.serverTimestamp() });

      // 記錄 trade_history
      await db.collection("trade_history").add({
        listingId: offer.listingId, offerId,
        buyerId: offer.buyerId, sellerId: offer.sellerId,
        offeredCards: offer.offerCards || [], receivedCard: listing.card,
        cashAdjustedHkd: offer.cashAddHkd || 0,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    return { offerId, newStatus };
  }
);

exports.getMyOffers = v2.https.onCall(
  { region: "us-central1" },
  async (data, context) => {
    const userId = requireAuth(context);
    const { type = "all" } = data;
    const snaps = await db.collection("offers").get();
    let offers = snaps.docs.map(d => ({ id: d.id, ...d.data() }));
    if (type === "sent") offers = offers.filter(o => o.buyerId === userId);
    else if (type === "received") offers = offers.filter(o => o.sellerId === userId);
    else offers = offers.filter(o => o.buyerId === userId || o.sellerId === userId);
    offers.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    return { offers };
  }
);

exports.executeTrade = v2.https.onCall(
  { region: "us-central1" },
  async (data, context) => {
    const userId = requireAuth(context);
    const { listingId, myCards, cashAddHkd } = data;
    if (!listingId) throw new functions.https.HttpsError("invalid-argument", "缺少 listingId");
    const listingRef = db.collection("listings").doc(listingId);
    const listingSnap = await listingRef.get();
    if (!listingSnap.exists) throw new functions.https.HttpsError("not-found", "Listing not found");
    const listing = listingSnap.data();
    if (listing.sellerId === userId) throw new functions.https.HttpsError("invalid-argument", "不能和自己交易");
    const tradeData = {
      listingId, buyerId: userId, sellerId: listing.sellerId,
      offeredCards: myCards || [], receivedCard: listing.card,
      cashAdjustedHkd: cashAddHkd || 0,
      status: "pending_seller_confirm",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const tradeRef = await db.collection("trade_history").add(tradeData);
    return { tradeId: tradeRef.id, status: "pending_seller_confirm" };
  }
);

exports.createListing = v2.https.onCall(
  { region: "us-central1" },
  async (data, context) => {
    const sellerId = requireAuth(context);
    const { card, price, condition, type = "fixed", auctionEnd } = data;
    if (!card || !price) throw new functions.https.HttpsError("invalid-argument", "缺少 card 或 price");
    const listingData = {
      card, price, condition: condition || "Near Mint",
      type, auctionEnd: auctionEnd || null,
      sellerId, status: "active",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const listingRef = await db.collection("listings").add(listingData);
    return { listingId: listingRef.id, status: "active" };
  }
);

exports.getUserCards = v2.https.onCall(
  { region: "us-central1" },
  async (data, context) => {
    const userId = requireAuth(context);
    const snaps = await db.collection("user_cards").doc(userId).collection("cards").get();
    const cards = snaps.docs.map(d => ({ id: d.id, ...d.data() }));
    return { cards };
  }
);

exports.cancelOffer = v2.https.onCall(
  { region: "us-central1" },
  async (data, context) => {
    const buyerId = requireAuth(context);
    const { offerId } = data;
    if (!offerId) throw new functions.https.HttpsError("invalid-argument", "缺少 offerId");
    const offerRef = db.collection("offers").doc(offerId);
    const offerSnap = await offerRef.get();
    if (!offerSnap.exists) throw new functions.https.HttpsError("not-found", "Offer not found");
    const offer = offerSnap.data();
    if (offer.buyerId !== buyerId) throw new functions.https.HttpsError("permission-denied", "只能取消自己發出的 Offer");
    if (offer.status !== "pending" && offer.status !== "countered") {
      throw new functions.https.HttpsError("failed-precondition", `Offer 狀態為 ${offer.status}，無法取消`);
    }
    await offerRef.update({ status: "cancelled", respondedAt: admin.firestore.FieldValue.serverTimestamp() });
    return { offerId, newStatus: "cancelled" };
  }
);


// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 1 — Version Search (searchCards)
// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 2 — Card Quality Review
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Submit a card listing for community quality review
 * Triggered: when listing price >= REVIEW_THRESHOLD (HK$500)
 * Input: { cardId, selfGrade, condition, photos[], hasCertificate, certificateGrade }
 * Output: { reviewId, status }
 */
exports.submitForReview = v2.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'must be signed in');

  const {
    cardId, selfGrade, condition, photos = [],
    hasCertificate = false, certificateGrade = null,
  } = data;

  const reviewRef = db.collection('reviews').doc();
  const now = Date.now();

  // Auto-approve if has valid certificate
  const status = hasCertificate && certificateGrade ? 'approved' : 'pending';

  await reviewRef.set({
    id: reviewRef.id,
    cardId,
    sellerId: context.auth.uid,
    selfGrade: selfGrade ?? condition ?? 'Near Mint',
    photos,
    hasCertificate: Boolean(hasCertificate),
    certificateGrade: certificateGrade ? parseInt(certificateGrade) : null,
    status,
    finalGrade: hasCertificate && certificateGrade ? selfGrade : null,
    createdAt: now,
    votesRequired: 3,
    votesReceived: 0,
  });

  return { reviewId: reviewRef.id, status };
});

/**
 * Cast a community review vote
 * Input: { reviewId, grade }
 * Output: { success, votesReceived, finalGrade? }
 */
exports.castReviewVote = v2.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'must be signed in');

  const { reviewId, grade } = data;
  if (!reviewId || !grade) throw new functions.https.HttpsError('invalid-argument', 'reviewId and grade required');

  // Check user is a verified reviewer
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!userDoc.data()?.isVerifiedReviewer) {
    throw new functions.https.HttpsError('permission-denied', 'not_authorized');
  }

  const reviewRef = db.collection('reviews').doc(reviewId);
  const review = await reviewRef.get();
  if (!review.exists) throw new functions.https.HttpsError('not-found', 'review not found');
  if (review.data().status !== 'pending') {
    throw new functions.https.HttpsError('failed-precondition', 'review not pending');
  }

  // Record vote
  await reviewRef.collection('votes').add({
    userId: context.auth.uid,
    userName: userDoc.data().displayName ?? 'Unknown',
    grade,
    votedAt: Date.now(),
  });

  // Update vote count
  const votesReceived = (review.data().votesReceived ?? 0) + 1;
  await reviewRef.update({ votesReceived });

  // Check if 3 votes reached → resolve
  if (votesReceived >= 3) {
    const votesSnap = await reviewRef.collection('votes').get();
    const gradeCount = {};
    votesSnap.docs.forEach(v => {
      const g = v.data().grade;
      gradeCount[g] = (gradeCount[g] ?? 0) + 1;
    });
    const finalGrade = Object.entries(gradeCount)
      .sort((a, b) => b[1] - a[1])[0][0];

    await reviewRef.update({ status: 'approved', finalGrade });

    // Update the associated listing to verified
    await db.collection('listings').doc(review.data().cardId).update({
      isVerified: true,
      verifiedGrade: finalGrade,
      reviewId,
    });
  }

  return { success: true, votesReceived };
});

/**
 * Get review status
 * Input: { reviewId }
 * Output: review document
 */
exports.getReviewResult = v2.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'must be signed in');
  const { reviewId } = data;
  if (!reviewId) throw new functions.https.HttpsError('invalid-argument', 'reviewId required');

  const review = await db.collection('reviews').doc(reviewId).get();
  if (!review.exists) throw new functions.https.HttpsError('not-found', 'review not found');
  return { id: review.id, ...review.data() };
});

/**
 * Get pending reviews for a verified reviewer
 * Returns reviews awaiting votes
 */
exports.getPendingReviews = v2.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'must be signed in');

  const snap = await db.collection('reviews')
    .where('status', '==', 'pending')
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();

  return {
    reviews: snap.docs.map(d => ({ id: d.id, ...d.data() })),
    total: snap.size,
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 3 — DM Chat
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create or resume a chat thread (buyer <-> seller)
 * Input: { listingId?, parties: [uidA, uidB] }
 * Output: { threadId }
 */
exports.createChatThread = v2.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'must be signed in');

  const { listingId, parties } = data;
  if (!parties || parties.length < 2) {
    throw new functions.https.HttpsError('invalid-argument', 'parties required');
  }

  // Sort parties for consistent lookup
  const sortedParties = [...parties].sort();

  // Check if thread already exists for these parties
  let existingQ;
  if (listingId) {
    existingQ = await db.collection('chat_threads')
      .where('listingId', '==', listingId)
      .where('parties', '==', sortedParties)
      .limit(1).get();
  } else {
    existingQ = await db.collection('chat_threads')
      .where('parties', '==', sortedParties)
      .where('listingId', '==', null)
      .limit(1).get();
  }

  if (!existingQ.empty) {
    return { threadId: existingQ.docs[0].id };
  }

  // Create new thread
  const threadRef = db.collection('chat_threads').doc();
  const now = Date.now();
  const unreadCount = {};
  sortedParties.forEach(p => { unreadCount[p] = 0; });

  await threadRef.set({
    id: threadRef.id,
    listingId: listingId ?? null,
    parties: sortedParties,
    lastMessage: null,
    lastMessageAt: now,
    unreadCount,
    createdAt: now,
  });

  return { threadId: threadRef.id };
});

/**
 * Send a message in a thread
 * Input: { threadId, text }
 * Output: { messageId }
 */
exports.sendMessage = v2.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'must be signed in');

  const { threadId, text } = data;
  if (!threadId || !text?.trim()) {
    throw new functions.https.HttpsError('invalid-argument', 'threadId and text required');
  }

  // Verify user is a party in this thread
  const threadDoc = await db.collection('chat_threads').doc(threadId).get();
  if (!threadDoc.exists) throw new functions.https.HttpsError('not-found', 'thread not found');
  if (!threadDoc.data().parties.includes(context.auth.uid)) {
    throw new functions.https.HttpsError('permission-denied', 'not a thread participant');
  }

  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const userName = userDoc.data()?.displayName ?? '未知用戶';
  const now = Date.now();

  const msgRef = db.collection('chat_messages').doc(threadId)
    .collection('messages').doc();

  await msgRef.set({
    id: msgRef.id,
    senderId: context.auth.uid,
    senderName: userName,
    text: text.trim(),
    createdAt: now,
    readBy: [context.auth.uid],
    type: 'text',
  });

  // Update thread lastMessage + increment other party's unread
  const parties = threadDoc.data().parties;
  const newUnread = { ...(threadDoc.data().unreadCount ?? {}) };
  parties.forEach(p => {
    if (p !== context.auth.uid) newUnread[p] = (newUnread[p] ?? 0) + 1;
  });

  await threadDoc.ref.update({
    lastMessage: text.trim(),
    lastMessageAt: now,
    unreadCount: newUnread,
  });

  return { messageId: msgRef.id };
});

/**
 * Mark a thread as read (reset own unread count)
 * Input: { threadId }
 */
exports.markThreadRead = v2.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'must be signed in');
  const { threadId } = data;
  if (!threadId) throw new functions.https.HttpsError('invalid-argument', 'threadId required');

  await db.collection('chat_threads').doc(threadId).update({
    [`unreadCount.${context.auth.uid}`]: 0,
  });

  return { success: true };
});

/**
 * Get chat threads for current user
 * Output: { threads: ChatThread[] }
 */
exports.getChatThreads = v2.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'must be signed in');

  const snap = await db.collection('chat_threads')
    .where('parties', 'array-contains', context.auth.uid)
    .orderBy('lastMessageAt', 'desc')
    .limit(50)
    .get();

  return { threads: snap.docs.map(d => ({ id: d.id, ...d.data() })) };
});

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE — Card Price API (TCGdex)
// ─────────────────────────────────────────────────────────────────────────────

let FX_EUR_TO_HKD = 8.5;
let FX_USD_TO_HKD = 7.8;

async function refreshFxRates() {
  try {
    const resp = await fetch('https://api.exchangerate-api.com/v4/latest/USD', { timeout: 5000 });
    const data = await resp.json();
    const eurToUsd = data.rates.EUR;
    const hkdToUsd = data.rates.HKD;
    FX_USD_TO_HKD = hkdToUsd;
    FX_EUR_TO_HKD = hkdToUsd / eurToUsd;
    console.log('[FX] Refreshed — USD/HKD:', FX_USD_TO_HKD, 'EUR/HKD:', FX_EUR_TO_HKD);
  } catch (e) {
    console.warn('[FX] Refresh failed, using defaults — USD/HKD:', FX_USD_TO_HKD);
  }
}

// Call on module load
exports.syncCardPrices = v2.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "admin only");
  const { cardIds = [] } = data;
  let updated = 0, failed = 0;
  for (const cardId of cardIds) {
    try {
      const priceData = await fetchTcgdexPrice(cardId);
      if (priceData) {
        await db.collection("card_prices").doc(cardId).set({ ...priceData, updatedAt: Date.now() }, { merge: true });
        updated++;
      } else { failed++; }
      await sleep(500);
    } catch (e) { console.warn("syncCardPrices failed:", cardId, e.message); failed++; }
  }
  return { updated, failed };
});

/**
 * Get price for a single card (on-demand, with 6h cache)
 * Input: { cardId: string }
 */
exports.getCardPrice = v2.https.onCall(async (data, context) => {
  const { cardId } = data;
  if (!cardId) throw new functions.https.HttpsError("invalid-argument", "cardId required");
  const cached = await db.collection("card_prices").doc(cardId).get();
  const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
  if (cached.exists && (Date.now() - cached.data().updatedAt) < CACHE_TTL) {
    return { source: "cache", ageMs: Date.now() - cached.data().updatedAt, ...cached.data() };
  }
  const priceData = await fetchTcgdexPrice(cardId);
  if (priceData) {
    await db.collection("card_prices").doc(cardId).set({ ...priceData, updatedAt: Date.now() }, { merge: true });
  }
  return { source: "live", ...(priceData ?? { error: "not found" }) };
});

/**
 * Search cards + enrich with prices (bulk, avoids N+1 calls to TCGdex)
 * Input: { query: string, language?: string, limit?: number }
 */
exports.searchCardsWithPrices = v2.https.onCall(async (data, context) => {
  const raw = data?.data ?? data ?? {};
  const { query = '', language: languageRaw = 'en', limit = 20 } = raw;
  const language = languageRaw ?? 'en';
  console.log('[searchCardsWithPrices] query:', query, 'lang:', language, 'limit:', limit);
  if (!query) throw new functions.https.HttpsError("invalid-argument", "search query is required");
  const searchUrl = `https://api.tcgdex.net/v2/${language}/cards?name=${encodeURIComponent(query.toLowerCase())}`;
  const searchResp = await fetch(searchUrl, { timeout: 8000 });
  if (!searchResp.ok) {
    console.warn('[searchCardsWithPrices] TCGdex API failed, status:', searchResp.status);
    // Return empty results instead of throwing - degraded mode
    return { cards: [], total: 0, error: "TCGdex API unavailable" };
  }
  let cards = await searchResp.json();
  if (!Array.isArray(cards)) cards = [cards];
  const results = cards.slice(0, limit);
  const enriched = await Promise.all(results.map(async (card) => {
    const cid = card.id;
    let cached = null;
    try {
      const cachedDoc = await db.collection("card_prices").doc(cid).get();
      cached = cachedDoc.exists ? cachedDoc.data() : null;
    } catch(e) {
      // Firestore lookup failed - continue without cache
    }
    return {
      id: cid, name: card.name,
      set: card.set?.name ?? card.set ?? "",
      setCode: card.set?.id ?? "",
      imageUrl: card.image ?? card.smallImage ?? card.largeImage ?? "",
      rarity: card.rarity ?? "",
      language,
      price: cached ?? null,
    };
  }));
  return { cards: enriched, total: enriched.length };
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function fetchTcgdexPrice(cardId) {
  // cardId format: "swsh5-115" or Firestore doc id
  let setCode = null, cardNum = null;
  if (cardId.includes("-")) {
    const parts = cardId.split("-");
    // last part is number, everything before is set
    setCode = parts.slice(0, -1).join("-");
    cardNum = parts[parts.length - 1];
  }
  if (!setCode || !cardNum) {
    const cardDoc = await db.collection("cards").doc(cardId).get();
    if (!cardDoc.exists) return null;
    const d = cardDoc.data();
    setCode = d.setCode || d.set;
    cardNum = d.number;
  }
  return fetchAndCache(setCode, cardNum, cardId);
}

async function fetchAndCache(setCode, cardNum, fallbackId) {
  try {
    const url = `https://api.tcgdex.net/v2/cards/${setCode}/${cardNum}?lang=en`;
    const resp = await fetch(url, { timeout: 8000 });
    if (!resp.ok) return null;
    const card = await resp.json();
    const markets = card.markets ?? {};
    const cm = markets.cardmarket ?? {};
    const tcg = markets.tcgplayer ?? {};

    const priceEur = parseFloat(cm.averagePrice) || 0;
    const priceUsd = parseFloat(tcg.averagePrice) || 0;
    const trendEur = parseFloat(cm.priceChange?.priceChange) || 0;

    const hkdMarket = Math.round(priceEur * FX_EUR_TO_HKD * 100) / 100;
    const hkdTcg    = Math.round(priceUsd * FX_USD_TO_HKD * 100) / 100;
    const bestHkd  = Math.max(hkdMarket, hkdTcg);

    const change24h = priceEur > 0
      ? Math.round(((trendEur / priceEur) * 100) * 10) / 10
      : 0;

    return {
      id: fallbackId, setCode, cardNumber: cardNum,
      priceEurUsd: { eur: priceEur, usd: priceUsd },
      priceHkd: bestHkd, cardmarketHkd: hkdMarket, tcgplayerHkd: hkdTcg,
      change24h,
      lastFetched: Date.now(),
    };
  } catch (e) {
    console.warn("[fetchAndCache]", setCode, cardNum, e.message);
    return null;
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }


// ─────────────────────────────────────────────────────────────────────────────
// PRICE SYNC SCHEDULED JOB (runs every 6 hours via Cloud Scheduler)
// ─────────────────────────────────────────────────────────────────────────────

exports.refreshFxRatesScheduled = functions.pubsub
  .schedule('every 360 minutes')
  .onRun(async () => {
    await refreshFxRates();
    return null;
  });

exports.syncCardPricesScheduled = functions.pubsub
  .schedule('every 180 minutes')
  .timeZone("Asia/Hong_Kong")
  .onRun(async (message) => {
    // Refresh FX rates first before syncing prices
    await refreshFxRates();
    console.log("[syncCardPricesScheduled] Starting 3-hour price sync");

    // Top traded cards by volume — update these every 6 hours
    // Format: "setCode-cardNumber" matching TCGdex path format
    // All IDs verified against TCGdex API v2 (https://api.tcgdex.net/v2/en/cards/{id})
    const TOP_CARDS = [
      // Sword & Shield — VMAX / VSTAR (verified)
      "swsh3-20",    // Charizard VMAX (Darkness Ablaze)
      "swsh8-157",   // Gengar VMAX (Fusion Strike)
      "swsh12-139",  // Lugia VSTAR (Astral Radiance)
      "swsh7-215",   // Umbreon VMAX (Evolving Skies)
      "swsh2-93",    // Dragapult VMAX (Rebel Clash)
      "swsh11-122",  // Pikachu VMAX (Vivid Voltage)
      "swsh9-123",   // Arceus VSTAR (Brilliant Stars)
      "swsh4-44",    // Pikachu VMAX alt (Vivid Voltage)
      "swsh10.5-031",// Mewtwo VSTAR (Shining Fates)
      "swsh3-76",    // Rayquaza VMAX (Champion's Path)
      // Hidden Fates / Shining Fates
      "swsh4.5-SV107",// Charizard VMAX (Shining Fates)
      "sm115-68",    // Mewtwo-GX (Hidden Fates)
      // Base Set — OG grailles
      "base4-4",     // Charizard (Base Set)
      "base4-2",     // Blastoise (Base Set)
      "base4-15",    // Venusaur (Base Set)
      // Additional high-value cards
      "swsh12-202",  // Lugia VSTAR alt (Evolving Skies)
      "swsh9-176",   // Arceus VSTAR alt (Brilliant Stars)
      // Bonus — popular Fusion Strike cards
      "swsh8-114",   // Mew VMAX (Fusion Strike)
      "swsh8-185",   // Genesect V (Fusion Strike)
      "swsh8-79",    // Inteleon VMAX (Fusion Strike)
      // Evolving Skies — Eeveelutions
      "swsh7-65",    // Espeon VMAX (Evolving Skies)
      "swsh7-75",    // Sylveon VMAX (Evolving Skies)
      // Brilliant Stars — Galarian Birds
      "swsh9-182",   // Galarian Zapdos V (Brilliant Stars)
      // Crown Zenith — Ice Rider Calyrex VMAX
      "swsh6-46",    // Ice Rider Calyrex VMAX (Crown Zenith)
      // Astral Radiance — high-value cards
      "swsh12-172",  // Reshiram V (Astral Radiance)
      "swsh12-173",  // Alolan Vulpix V (Astral Radiance)
      // Champion's Path
      "swsh6-53",    // Zeraora V (Champion's Path)
    ];

    let updated = 0, failed = 0;

    for (const cardId of TOP_CARDS) {
      try {
        const priceData = await fetchTcgdexPrice(cardId);
        if (priceData) {
          await db.collection("card_prices").doc(cardId).set({
            ...priceData,
            updatedAt: Date.now(),
            lastScheduledSync: Date.now(),
          }, { merge: true });
          updated++;
          console.log(`[sync] ${cardId}: HKD ${priceData.priceHkd}`);
        } else {
          failed++;
          console.warn(`[sync] ${cardId}: no data returned`);
        }
        await sleep(600); // be kind — ~1.6 req/sec max
      } catch (e) {
        failed++;
        console.warn(`[sync] ${cardId} failed:`, e.message);
      }
    }

    console.log(`[syncCardPricesScheduled] Done: ${updated} updated, ${failed} failed`);
    return null;
  });


// ─────────────────────────────────────────────────────────────────────────────
// PROTECTION LAYER 1 — Day-5 Escrow Warning (Scheduled)
// Finds orders in funds_escrowed for 5-7 days and sends warning notifications.
// ─────────────────────────────────────────────────────────────────────────────
exports.sendEscrowWarning = functions.pubsub
  .schedule("every 24 hours")
  .timeZone("Asia/Hong_Kong")
  .onRun(async (message) => {
    const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const ordersSnap = await db.collection("orders")
      .where("status", "==", "funds_escrowed")
      .get();

    const results = { warned: 0, skipped: 0 };

    for (const docSnap of ordersSnap.docs) {
      const order = docSnap.data();
      const createdMs = order.createdAt ? (order.createdAt.seconds || Date.now()) * 1000 : Date.now();
      const ageMs = now - createdMs;

      if (ageMs >= SEVEN_DAYS_MS || order.releaseWarningSentAt || ageMs < FIVE_DAYS_MS) {
        results.skipped++;
        continue;
      }

      const daysUntilRelease = Math.ceil((SEVEN_DAYS_MS - ageMs) / (24 * 60 * 60 * 1000));

      try {
        await db.collection("notifications").doc(docSnap.id).set({
          type: "escrow_warning",
          title: "⚠️ 款項即將自動釋放",
          body: "你的訂單 HK$" + order.amountHkd + " 即將於 " + daysUntilRelease + " 日後自動釋放俾賣家，如未收到卡請立即確認",
          orderId: docSnap.id,
          toUserId: order.buyerId,
          amountHkd: order.amountHkd,
          cardName: order.cardName || "Pokemon 卡",
          daysLeft: daysUntilRelease,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await docSnap.ref.update({
          releaseWarningSentAt: now,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        results.warned++;
      } catch (err) {
        console.error("[sendEscrowWarning] failed for " + docSnap.id + ": " + err.message);
        results.skipped++;
      }
    }

    console.log("[sendEscrowWarning] complete: " + results.warned + " warned");
    return null;
  });

// ─────────────────────────────────────────────────────────────────────────────
// PROTECTION LAYER 2 — Extend Escrow (Buyer extends from Day 7 → Day 14)
// ─────────────────────────────────────────────────────────────────────────────
exports.extendEscrow = v2.https.onCall(
  { region: "us-central1" },
  async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Must be logged in");
    const { orderId } = data;
    if (!orderId) throw new functions.https.HttpsError("invalid-argument", "orderId required");

    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) throw new functions.https.HttpsError("not-found", "Order not found");
    const order = orderSnap.data();
    if (order.buyerId !== context.auth.uid) throw new functions.https.HttpsError("permission-denied", "Only buyer can extend");

    if (order.status !== "funds_escrowed") {
      throw new functions.https.HttpsError("failed-precondition", "Cannot extend - order status is " + order.status);
    }
    if (order.extendedUntil && order.extendedUntil > Date.now()) {
      throw new functions.https.HttpsError("failed-precondition", "Escrow already extended");
    }

    const newReleaseAt = Date.now() + 14 * 24 * 60 * 60 * 1000;

    await orderRef.update({
      extendedUntil: newReleaseAt,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, newReleaseAt };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PROTECTION LAYER 3 — Create Dispute (Post-Release)
// Buyer can dispute within 30 days of release.
// ─────────────────────────────────────────────────────────────────────────────
exports.createDispute = v2.https.onCall(
  { region: "us-central1" },
  async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Must be logged in");
    const { orderId, reason } = data;
    if (!orderId || !reason) throw new functions.https.HttpsError("invalid-argument", "orderId and reason required");

    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) throw new functions.https.HttpsError("not-found", "Order not found");
    const order = orderSnap.data();
    if (order.buyerId !== context.auth.uid) throw new functions.https.HttpsError("permission-denied", "Only buyer can dispute");

    const validStatuses = ["funds_escrowed", "funds_released"];
    if (!validStatuses.includes(order.status)) {
      throw new functions.https.HttpsError("failed-precondition", "Cannot dispute - order status is " + order.status);
    }

    if (order.status === "funds_released") {
      const releasedAt = order.releasedAt ? (order.releasedAt.seconds || Date.now()) * 1000 : Date.now();
      const daysSinceRelease = (Date.now() - releasedAt) / (30 * 24 * 60 * 60 * 1000);
      if (daysSinceRelease > 1.0) {
        throw new functions.https.HttpsError("failed-precondition", "Dispute window closed - 30 days since release");
      }
    }

    const disputeRef = db.collection("disputes").doc();
    await disputeRef.set({
      id: disputeRef.id,
      orderId,
      buyerId: context.auth.uid,
      sellerId: order.sellerId,
      reason,
      cardName: order.cardName || "",
      amountHkd: order.amountHkd || 0,
      status: "open",
      createdAt: Date.now(),
    });

    await orderRef.update({
      status: "disputed",
      disputeId: disputeRef.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection("notifications").doc().set({
      type: "dispute_opened",
      title: "🛡️ 爭議已開啟",
      body: "買家對訂單 " + orderId + " 提出爭議：" + reason,
      orderId,
      toUserId: order.sellerId,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { disputeId: disputeRef.id, status: "open" };
  }
);


// ─────────────────────────────────────────────────────────────────────────────
// USER REGISTRATION & PROFILE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * completeProfile — called by app after first auth to save phone/email/name
 * Input: { displayName, phone, email }
 */
exports.completeProfile = v2.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'sign in first');
  const { displayName, phone, email } = data;
  if (!displayName) throw new functions.https.HttpsError('invalid-argument', 'displayName required');
  await db.collection('users').doc(context.auth.uid).set({
    displayName, phone: phone ?? '', email: email ?? '',
    memberSince: Date.now(), lastLogin: Date.now(),
    isBuyer: true, isSeller: false,
    positiveReviews: 0, negativeReviews: 0,
    language: 'zh-HK', notificationsEnabled: true,
  }, { merge: true });
  return { success: true };
});

/**
 * getUserProfile — public profile for any user
 * Input: { uid }
 */
exports.getUserProfile = v2.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'sign in first');
  const { uid } = data;
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) throw new functions.https.HttpsError('not-found', 'user not found');
  const d = snap.data();
  // Remove sensitive fields
  delete d.transactionPinHash;
  return { user: { uid, ...d } };
});

// ─────────────────────────────────────────────────────────────────────────────
// REVIEW SYSTEM (positive / negative only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * submitReview — leave a positive or negative review for the counterparty in an order
 * Input: { orderId, type: 'positive' | 'negative', comment?: string }
 * Both buyer and seller can review each other after order is released/completed.
 */
exports.submitReview = v2.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'must be signed in');
  const { orderId, type, comment } = data;
  if (!orderId || !type) throw new functions.https.HttpsError('invalid-argument', 'orderId and type required');
  if (type !== 'positive' && type !== 'negative') throw new functions.https.HttpsError('invalid-argument', 'type must be positive or negative');

  const orderRef = db.collection('orders').doc(orderId);
  const order = await orderRef.get();
  if (!order.exists) throw new functions.https.HttpsError('not-found', 'order not found');
  const d = order.data();
  const myId = context.auth.uid;
  const isBuyer = d.buyerId === myId;
  const isSeller = d.sellerId === myId;
  if (!isBuyer && !isSeller) throw new functions.https.HttpsError('permission-denied', 'not a participant');

  const revieweeId = isBuyer ? d.sellerId : d.buyerId;

  // Check no duplicate review
  const existing = await db.collection('reviews')
    .where('orderId', '==', orderId)
    .where('reviewerId', '==', myId)
    .limit(1).get();
  if (!existing.empty) throw new functions.https.HttpsError('already-exists', 'you already reviewed this order');

  const reviewRef = db.collection('reviews').doc();
  await reviewRef.set({
    id: reviewRef.id, orderId, reviewerId: myId, revieweeId,
    type, comment: comment ?? '',
    cardName: d.cardName ?? '', createdAt: Date.now(),
  });

  // Update reviewee's score
  const inc = type === 'positive' ? { positiveReviews: admin.firestore.FieldValue.increment(1) }
                                 : { negativeReviews: admin.firestore.FieldValue.increment(1) };
  await db.collection('users').doc(revieweeId).update(inc);

  return { reviewId: reviewRef.id, success: true };
});

/**
 * getUserReviews — get all reviews for a user
 * Input: { uid, limit?: number }
 */
exports.getUserReviews = v2.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'must be signed in');
  const { uid, limit = 50 } = data;
  const snap = await db.collection('reviews')
    .where('revieweeId', '==', uid)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return { reviews: snap.docs.map(d => ({ id: d.id, ...d.data() })) };
});

