/**
 * PokeMarket — Firebase Cloud Functions
 * Stripe Connect Escrow + Trade Platform
 *
 * Deploy: firebase deploy --only functions --project pokemarket-255c6
 */

require("dotenv").config({ path: __dirname + "/../../.env" });
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const cors = require("cors")({ origin: true });
const v2 = require("firebase-functions/v2");

admin.initializeApp();
const db = admin.firestore();

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const PLATFORM_FEE_PERCENT = 0.03;

function splitAmount(grossHkdCents) {
  const platformFee = Math.round(grossHkdCents * PLATFORM_FEE_PERCENT);
  const sellerNet = grossHkdCents - platformFee;
  return { platformFee, sellerNet };
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
    const { orderId, sellerStripeAccountId } = data;
    const orderRef = db.collection("orders").doc(orderId);
    const order = await orderRef.get();
    if (!order.exists) throw new functions.https.HttpsError("not-found", "Order not found");
    const orderData = order.data();
    if (orderData.buyerId !== context.auth.uid) throw new functions.https.HttpsError("permission-denied", "Only buyer can release funds");
    if (orderData.status !== "funds_escrowed") throw new functions.https.HttpsError("failed-precondition", `Cannot release — order status is "${orderData.status}"`);
    if (!sellerStripeAccountId) throw new functions.https.HttpsError("invalid-argument", "Seller Stripe account ID required");

    const transfer = await stripe.transfers.create({
      amount: orderData.sellerNet, currency: "hkd", destination: sellerStripeAccountId,
      source_transaction: orderData.paymentIntentId,
      metadata: { orderId, buyerId: orderData.buyerId, platformFee: String(orderData.platformFee) },
      description: `PokeMarket — Sale proceeds — ${orderData.cardName}`,
    });

    await orderRef.update({
      status: "funds_released", transferId: transfer.id,
      releasedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: true, transferId: transfer.id, amountTransferred: orderData.sellerNet, orderId };
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
  { region: "us-central1" },
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
          await db.collection("orders").doc(pi.metadata.orderId).update({
            status: "funds_escrowed",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
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

// ─────────────────────────────────────────────────────────────────────────────
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

exports.searchCards = v2.https.onCall(async (data, context) => {
  const { query, language } = data;

  if (!query || query.trim().length < 1) {
    return { cards: [], total: 0 };
  }

  const searchTerm = query.trim();

  // Try Firestore full-text search first
  let cards = [];
  try {
    const cardsSnapshot = await db.collection('cards')
      .where('nameLower', '>=', searchTerm.toLowerCase())
      .where('nameLower', '<=', searchTerm.toLowerCase() + '\uf8ff')
      .limit(30)
      .get();

    if (!cardsSnapshot.empty) {
      cards = cardsSnapshot.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          name: d.name,
          set: d.set,
          setCode: d.setCode,
          rarity: d.rarity,
          price: d.price,
          priceChange24h: d.priceChange24h ?? 0,
          imageUrl: d.imageUrl,
          series: d.series,
          number: d.number,
          condition: d.condition,
          listed: d.listed ?? true,
          listingCount: d.listingCount ?? 0,
          language: d.language ?? 'English',
          grade: d.grade,
        };
      });
    }
  } catch (err) {
    // Index not configured — fall through to keyword scan
    console.warn('[searchCards] Firestore query failed:', err.message);
  }

  // If no results from Firestore (or error), scan mock data for development
  if (cards.length === 0) {
    const { MOCK_CARDS } = require('./src/data/mockData');
    const lang = language ?? null;
    cards = MOCK_CARDS
      .filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .filter(c => !lang || c.language === lang)
      .slice(0, 20)
      .map(c => ({ ...c }));
  } else if (language) {
    // Filter Firestore results by language
    cards = cards.filter(c => c.language === language);
  }

  return { cards, total: cards.length };
});

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
    oderId: context.auth.uid,
    oderName: userDoc.data().displayName ?? 'Unknown',
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
