/**
 * PokeMarket — Firebase Cloud Functions
 * Card Prices Sync from TCGdex → Firestore `card_prices`
 *
 * Deploy: firebase deploy --only functions
 */

require("dotenv").config({ path: __dirname + "/../../.env" });
const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// ─── Config ─────────────────────────────────────────────────────────────────────
const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";
const FX_API = "https://api.frankfurter.app/latest?from=EUR&to=HKD";

// HK popular cards (verified TCGdex IDs) — target 50+ cards for HK market
const HK_POPULAR_CARDS = [
  // ── Sword & Shield VMAX / VSTAR (most traded in HK) ──────────────
  "swsh3-20",    // Charizard VMAX (Darkness Ablaze)
  "swsh8-157",   // Gengar VMAX (Fusion Strike)
  "swsh12-139",   // Lugia VSTAR (Astral Radiance)
  "swsh7-215",   // Umbreon VMAX (Evolving Skies)
  "swsh2-93",    // Dragapult VMAX (Rebel Clash)
  "swsh11-122",  // Pikachu VMAX (Vivid Voltage)
  "swsh9-123",   // Arceus VSTAR (Brilliant Stars)
  "swsh10.5-031",// Mewtwo VSTAR (Shining Fates)
  "swsh3-76",    // Rayquaza VMAX (Champion's Path)
  "swsh12-202",  // Lugia VSTAR alt (Astral Radiance)
  "swsh9-176",   // Arceus VSTAR alt (Brilliant Stars)
  // ── Hidden Fates / Shining Fates ────────────────────────────────
  "swsh4.5-SV107",// Charizard VMAX (Shining Fates)
  "sm115-68",    // Mewtwo-GX (Hidden Fates)
  // ── Fusion Strike (recent high-value) ──────────────────────────
  "swsh8-114",   // Mew VMAX (Fusion Strike)
  "swsh8-185",   // Genesect V (Fusion Strike)
  "swsh8-79",    // Inteleon VMAX (Fusion Strike)
  // ── Evolving Skies — Eeveelutions ──────────────────────────────
  "swsh7-65",    // Espeon VMAX (Evolving Skies)
  "swsh7-75",    // Sylveon VMAX (Evolving Skies)
  // ── Brilliant Stars ───────────────────────────────────────────
  "swsh9-182",   // Galarian Zapdos V (Brilliant Stars)
  "swsh9-187",   // Galarian Moltres V (Brilliant Stars)
  "swsh9-195",   // Galarian Articuno V (Brilliant Stars)
  // ── Crown Zenith ──────────────────────────────────────────────
  "swsh6-46",    // Ice Rider Calyrex VMAX (Crown Zenith)
  "swsh6-45",    // Shadow Rider Calyrex VMAX (Crown Zenith)
  // ── Astral Radiance ───────────────────────────────────────────
  "swsh12-172",  // Reshiram V (Astral Radiance)
  "swsh12-173",  // Alolan Vulpix V (Astral Radiance)
  // ── Champion's Path ────────────────────────────────────────────
  "swsh6-53",    // Zeraora V (Champion's Path)
  "swsh6-54",    // Masked Royal's Pikachu VMAX (Champion's Path)
  // ── Base Set — OG chase cards ──────────────────────────────────
  "base4-4",     // Charizard (Base Set)
  "base4-2",     // Blastoise (Base Set)
  "base4-15",    // Venusaur (Base Set)
  "base4-58",    // Gengar (Base Set)
  "base4-9",     // Alakazam (Base Set)
  // ── Base Set 2 / Legendary Collection ───────────────────────────
  "base1-4",     // Charizard (1st Ed Base Set)
  "base1-1",     // Blastoise (1st Ed Base Set)
  "base1-58",    // Gengar (1st Ed Base Set)
  "base1-84",    // Pikachu (Base Set)
  "base1-83",    // Diglett (Base Set)
  "base1-10",    // Rocket's Scyther (Base Set)
  "base1-22",    // Chansey (Base Set)
  "base1-36",    // Bill (Base Set)
  "base1-45",    // Gust of Wind (Base Set)
  "base1-62",    // Energy Retrieval (Base Set)
  // ── Sun & Moon — Tag Team / GX ─────────────────────────────────
  "sm115-35",    // Charizard-GX (Burning Shadows)
  "sm115-36",    // Charizard-GX (Burning Shadows)
  "sm115-34",    // Charizard-GX (Burning Shadows)
  "sm35-1",      // Gyarados-GX (Guardians Rising)
  "sm35-2",      // Gyarados-GX (Guardians Rising)
  "sm215-1",     // Magearna-EX (Crimson Invasion)
];

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Fetch FX rates (EUR→HKD) */
async function getFxRates() {
  try {
    const res = await fetch(FX_API);
    const data = await res.json();
    const eurToHkd = parseFloat(data.rates?.HKD);
    if (!eurToHkd) throw new Error("No HKD rate");
    // Approximate USD→HKD (USD/EUR ≈ 1.08)
    const usdToHkd = eurToHkd / 1.08;
    return { eurToHkd, usdToHkd };
  } catch (e) {
    // Fallback
    return { eurToHkd: 8.48, usdToHkd: 7.78 };
  }
}

/** Fetch a single card's full data from TCGdex */
async function fetchTcgdexCard(cardId) {
  try {
    const res = await fetch(`${TCGDEX_BASE}/cards/${cardId}`, { timeout: 10000 });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error(`[TCGdex] Failed to fetch ${cardId}: ${e.message}`);
    return null;
  }
}

/** Extract and convert price data to HKD */
function extractPrice(cardData, fx) {
  const pricing = cardData.pricing || {};
  const cm = pricing.cardmarket || {};
  const tcg = pricing.tcgplayer || {};

  const priceEur = parseFloat(cm.avg || cm.trend || cm.low || 0);
  const priceUsd = parseFloat(tcg.averagePrice || tcg.marketPrice || 0);
  const trend    = parseFloat(cm.trend || priceEur);
  const avg7     = parseFloat(cm.avg7 || priceEur);
  const avg30    = parseFloat(cm.avg30 || priceEur);

  const cardmarketHkd = Math.round(priceEur * fx.eurToHkd * 100) / 100;
  const tcgplayerHkd  = Math.round(priceUsd * fx.usdToHkd * 100) / 100;
  const priceHkd      = Math.max(cardmarketHkd, tcgplayerHkd);

  const change24h = avg7 > 0 ? Math.round(((trend - avg7) / avg7) * 1000) / 10 : 0;
  const change30d = avg30 > 0 && priceEur > 0
    ? Math.round(((trend - avg30) / avg30) * 1000) / 10
    : null;

  return {
    priceEur, priceUsd,
    cardmarketHkd, tcgplayerHkd, priceHkd,
    change24h, change30d,
    trendEur: trend, lowestEur: parseFloat(cm.low || 0),
  };
}

// ─── Scheduled: Sync Card Prices Every 3 Hours ────────────────────────────────

exports.syncCardPrices = functions.pubsub
  .schedule("every 180 minutes")
  .timeZone("Asia/Hong_Kong")
  .onRun(async () => {
    console.log("[syncCardPrices] Starting price sync...");
    const fx = await getFxRates();
    console.log(`[syncCardPrices] FX: EUR→HKD ${fx.eurToHkd}, USD→HKD ${fx.usdToHkd}`);

    let success = 0, failed = 0, skipped = 0;

    for (const cardId of HK_POPULAR_CARDS) {
      try {
        const cardData = await fetchTcgdexCard(cardId);
        if (!cardData) { failed++; continue; }

        const pricing = cardData.pricing || {};
        if (!pricing || (!pricing.cardmarket && !pricing.tcgplayer)) {
          console.log(`[syncCardPrices] ${cardId}: no price data, skipping`);
          skipped++;
          continue;
        }

        const priceInfo = extractPrice(cardData, fx);
        const now = new Date();
        const docRef = db.collection("card_prices").document(cardId);

        await docRef.set({
          id: cardId,
          name:          cardData.name || "",
          localId:       cardData.localId || "",
          setName:       (cardData.set || {}).name || "",
          setCode:       (cardData.set || {}).id   || "",
          rarity:        cardData.rarity || "",
          imageUrl:      cardData.image || "",
          variants:      cardData.variants || {},
          priceEur:      priceInfo.priceEur,
          priceUsd:      priceInfo.priceUsd,
          cardmarketHkd: priceInfo.cardmarketHkd,
          tcgplayerHkd:  priceInfo.tcgplayerHkd,
          priceHkd:      priceInfo.priceHkd,
          change24hPct:  priceInfo.change24h,
          change30dPct:  priceInfo.change30d,
          trendEur:      priceInfo.trendEur,
          lowestEur:     priceInfo.lowestEur,
          fxEurToHkd:    fx.eurToHkd,
          fxUsdToHkd:    fx.usdToHkd,
          fetchedAt:     now.toISOString(),
          fetchedAtTs:  now.getTime(),
          source:        "tcgdex",
        }, { merge: true });

        console.log(`[syncCardPrices] ✓ ${cardData.name} → HK$${priceInfo.priceHkd}`);
        success++;

        // Rate limit: ~1 req/sec
        await new Promise(r => setTimeout(r, 650));
      } catch (e) {
        console.error(`[syncCardPrices] ${cardId} error: ${e.message}`);
        failed++;
      }
    }

    console.log(`[syncCardPrices] Done — ${success} synced, ${failed} failed, ${skipped} skipped`);
    return null;
  });

// ─── HTTP: Manually Trigger Seed / Sync ───────────────────────────────────────

/**
 * POST /seedCardPrices
 * Manually trigger a full price sync for HK popular cards.
 * Use from Firebase Console → Functions → syncCardPrices or a cron job.
 */
exports.seedCardPrices = functions.https.onRequest(async (req, res) => {
  // Optional: verify authorization header
  const authHeader = req.headers.authorization || "";
  const validToken = process.env.SEED_AUTH_TOKEN || "pokemarket-seed-2026";

  if (authHeader !== `Bearer ${validToken}`) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  try {
    console.log("[seedCardPrices] Starting manual sync...");
    const fx = await getFxRates();

    const results = [];
    for (const cardId of HK_POPULAR_CARDS) {
      const cardData = await fetchTcgdexCard(cardId);
      if (!cardData) {
        results.push({ cardId, status: "failed", error: "fetch_failed" });
        continue;
      }

      const pricing = cardData.pricing || {};
      if (!pricing || (!pricing.cardmarket && !pricing.tcgplayer)) {
        results.push({ cardId, status: "skipped", name: cardData.name });
        continue;
      }

      const priceInfo = extractPrice(cardData, fx);
      const now = new Date();

      await db.collection("card_prices").document(cardId).set({
        id: cardId,
        name:          cardData.name || "",
        localId:       cardData.localId || "",
        setName:       (cardData.set || {}).name || "",
        setCode:       (cardData.set || {}).id   || "",
        rarity:        cardData.rarity || "",
        imageUrl:      cardData.image || "",
        priceEur:      priceInfo.priceEur,
        priceUsd:      priceInfo.priceUsd,
        cardmarketHkd: priceInfo.cardmarketHkd,
        tcgplayerHkd:  priceInfo.tcgplayerHkd,
        priceHkd:      priceInfo.priceHkd,
        change24hPct:  priceInfo.change24h,
        change30dPct:  priceInfo.change30d,
        trendEur:      priceInfo.trendEur,
        lowestEur:     priceInfo.lowestEur,
        fxEurToHkd:    fx.eurToHkd,
        fxUsdToHkd:    fx.usdToHkd,
        fetchedAt:     now.toISOString(),
        fetchedAtTs:  now.getTime(),
        source:        "tcgdex",
      }, { merge: true });

      results.push({
        cardId,
        status: "success",
        name: cardData.name,
        priceHkd: priceInfo.priceHkd,
      });

      await new Promise(r => setTimeout(r, 650));
    }

    const successCount = results.filter(r => r.status === "success").length;
    console.log(`[seedCardPrices] Done — ${successCount}/${HK_POPULAR_CARDS.length} cards synced`);

    res.json({
      success: true,
      total: HK_POPULAR_CARDS.length,
      synced: successCount,
      results,
    });
  } catch (e) {
    console.error(`[seedCardPrices] Error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// ─── HTTP: Get Single Card Price (proxies TCGdex, handles CORS) ───────────────

/**
 * GET /getCardPrice?cardId=swsh3-20
 * Returns the cached price from Firestore `card_prices` collection.
 * Falls back to live TCGdex fetch if not in cache.
 */
exports.getCardPrice = functions.https.onRequest(async (req, res) => {
  const cardId = req.query.cardId || req.query.id;
  if (!cardId) {
    res.status(400).json({ error: "cardId required" });
    return;
  }

  try {
    // Try Firestore cache first
    const doc = await db.collection("card_prices").document(cardId).get();

    if (doc.exists) {
      const data = doc.data();
      const ageMs = Date.now() - (data.fetchedAtTs || 0);
      const ageH  = Math.round(ageMs / 3600000);

      // If cache is fresh (< 3 hours), return it
      if (ageMs < 3 * 3600000) {
        res.json({ ...data, cacheHit: true, cacheAgeH: ageH });
        return;
      }

      // Cache stale — fetch live and update
      const fx = await getFxRates();
      const cardData = await fetchTcgdexCard(cardId);
      if (cardData && cardData.pricing) {
        const priceInfo = extractPrice(cardData, fx);
        const now = new Date();
        const payload = {
          priceEur:      priceInfo.priceEur,
          priceUsd:      priceInfo.priceUsd,
          cardmarketHkd: priceInfo.cardmarketHkd,
          tcgplayerHkd:  priceInfo.tcgplayerHkd,
          priceHkd:      priceInfo.priceHkd,
          change24hPct:  priceInfo.change24h,
          change30dPct:  priceInfo.change30d,
          trendEur:      priceInfo.trendEur,
          lowestEur:     priceInfo.lowestEur,
          fetchedAt:     now.toISOString(),
          fetchedAtTs:   now.getTime(),
        };
        await doc.ref.set(payload, { merge: true });
        res.json({ ...data, ...payload, cacheHit: false, cacheAgeH: ageH });
        return;
      }

      // Return stale cache if live fetch fails
      res.json({ ...data, cacheHit: true, cacheStale: true });
      return;
    }

    // Not in Firestore — fetch live from TCGdex
    const fx = await getFxRates();
    const cardData = await fetchTcgdexCard(cardId);
    if (!cardData) {
      res.status(404).json({ error: `Card ${cardId} not found on TCGdex` });
      return;
    }

    const priceInfo = extractPrice(cardData, fx);
    const now = new Date();
    const payload = {
      id: cardId,
      name:       cardData.name || "",
      setName:    (cardData.set || {}).name || "",
      setCode:    (cardData.set || {}).id   || "",
      rarity:     cardData.rarity || "",
      imageUrl:   cardData.image || "",
      ...priceInfo,
      fxEurToHkd: fx.eurToHkd,
      fxUsdToHkd: fx.usdToHkd,
      fetchedAt:   now.toISOString(),
      fetchedAtTs: now.getTime(),
      source:      "tcgdex",
    };

    await db.collection("card_prices").document(cardId).set(payload, { merge: true });
    res.json({ ...payload, cacheHit: false, newlySeeded: true });
  } catch (e) {
    console.error(`[getCardPrice] ${cardId}: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});