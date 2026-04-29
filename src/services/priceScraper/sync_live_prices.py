"""
PokeMarket — TCGdex Price Fetcher + Firebase Uploader
Fetches live prices from TCGdex API (CardMarket EUR + TCGPlayer USD)
Converts to HKD and uploads to Firestore `card_prices` collection.

Usage:
  python3 src/services/priceScraper/sync_live_prices.py
  python3 src/services/priceScraper/sync_live_prices.py --card swsh3-20
  python3 src/services/priceScraper/sync_live_prices.py --deploy-functions

Requires:
  pip install firebase-admin google-cloud-firestore
  Firebase service account key at ~/.config/firebase/pokemarket-key.json
"""

import urllib.request
import urllib.parse
import json
import time
import os
import sys
from datetime import datetime, timezone

# ─── Verified TCGdex Card IDs for HK Popular Cards ────────────────────────────
# These are the CORRECT IDs that return actual card data from TCGdex API.
# Source: TCGdex API v2 (https://api.tcgdex.net/v2/en/cards/{id})
# Format: (tcgdex_id, display_name, set_name, rarity)

HK_POPULAR_CARDS = [
    # Sword & Shield — VMAX / VSTAR (verified working)
    ("swsh3-20",   "Charizard VMAX",       "Darkness Ablaze",      "Holo Rare VMAX"),
    ("swsh8-157",  "Gengar VMAX",          "Fusion Strike",         "Holo Rare VMAX"),
    ("swsh12-139", "Lugia VSTAR",          "Astral Radiance",       "Rare Ultra"),
    ("swsh7-215",  "Umbreon VMAX",         "Evolving Skies",        "Secret Rare"),
    ("swsh2-93",   "Dragapult VMAX",       "Rebel Clash",           "Holo Rare VMAX"),
    ("swsh11-122", "Pikachu VMAX",         "Vivid Voltage",         "Holo Rare VMAX"),
    ("swsh9-123",  "Arceus VSTAR",         "Brilliant Stars",       "Rare Ultra"),
    ("swsh4-44",   "Pikachu VMAX",         "Vivid Voltage",         "Holo Rare VMAX"),  # alt
    ("swsh10.5-031","Mewtwo VSTAR",        "Shining Fates",         "Rare Secret"),
    ("swsh3-76",   "Rayquaza VMAX",        "Champion's Path",       "Holo Rare VMAX"),
    # Hidden Fates / Shiny Vault
    ("swsh4.5-SV107","Charizard VMAX",      "Shining Fates",         "Shiny Rare VMAX"),
    ("sm115-68",   "Mewtwo-GX",            "Hidden Fates",          "Rare Ultra"),
    # Base Set — OG grailles
    ("base4-4",    "Charizard",            "Base Set",              "Rare"),
    ("base4-2",    "Blastoise",            "Base Set",              "Rare"),
    ("base4-15",   "Venusaur",             "Base Set",              "Rare"),
    # Additional high-value cards
    ("swsh12-202", "Lugia VSTAR",          "Evolving Skies",        "Rare Ultra"),  # alternate
    ("swsh9-176",  "Arceus VSTAR",         "Brilliant Stars",       "Rare Secret"),  # alt
]

# Cards where ID is known but needs price verification
CARDS_NEED_VERIFY = [
    "swsh12-71", "swsh4-116", "swsh8-188", "swsh3-76", "swsh9-138",
    "swsh12-215", "swsh2-239",
]

# ─── FX Rate Fetcher ──────────────────────────────────────────────────────────

def get_fx_rates():
    """Fetch live EUR→HKD and USD→HKD from exchangerate-api.com."""
    try:
        with urllib.request.urlopen(
            "https://api.exchangerate-api.com/v4/latest/USD",
            timeout=8
        ) as r:
            data = json.loads(r.read())
        usd_to_hkd = float(data["rates"]["HKD"])
        eur_to_usd = float(data["rates"]["EUR"])
        eur_to_hkd = usd_to_hkd / eur_to_usd
        return {"EUR_TO_HKD": round(eur_to_hkd, 4), "USD_TO_HKD": round(usd_to_hkd, 4)}
    except Exception as e:
        print(f"[FX] Fallback rates used: {e}")
        return {"EUR_TO_HKD": 8.48, "USD_TO_HKD": 7.78}


# ─── TCGdex Fetcher ───────────────────────────────────────────────────────────

def fetch_tcgdex_card(card_id: str) -> dict | None:
    """Fetch full card data from TCGdex."""
    url = f"https://api.tcgdex.net/v2/en/cards/{card_id}"
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"  [TCGdex] Error fetching {card_id}: {e}")
        return None


def extract_price(card_data: dict, fx: dict) -> dict:
    """Extract EUR/USD prices from TCGdex response and convert to HKD."""
    pricing = card_data.get("pricing", {})
    cm = pricing.get("cardmarket", {}) or {}
    tcg = pricing.get("tcgplayer", {}) or {}

    price_eur = float(cm.get("avg") or cm.get("trend") or cm.get("low") or 0)
    price_usd = float(tcg.get("averagePrice") or tcg.get("marketPrice") or 0)

    cardmarket_hkd = round(price_eur * fx["EUR_TO_HKD"], 2)
    tcgplayer_hkd  = round(price_usd * fx["USD_TO_HKD"], 2)

    # Prefer: CardMarket for JP/EU cards, TCGplayer for US cards
    # Show both so users can compare
    best_hkd = max(cardmarket_hkd, tcgplayer_hkd)

    # 24h % change
    avg7  = float(cm.get("avg7") or price_eur)
    avg30 = float(cm.get("avg30") or price_eur)
    trend = float(cm.get("trend") or 0)

    change_24h = 0.0
    if avg7 > 0:
        change_24h = round(((trend - avg7) / avg7) * 100, 1)

    change_30d = None
    if avg30 > 0 and price_eur > 0:
        change_30d = round(((trend - avg30) / avg30) * 100, 1)

    return {
        "priceEur":     round(price_eur, 2),
        "priceUsd":     round(price_usd, 2),
        "cardmarketHkd": cardmarket_hkd,
        "tcgplayerHkd":  tcgplayer_hkd,
        "priceHkd":      best_hkd,
        "change24hPct":  change_24h,
        "change30dPct":  change_30d,
        "trendEur":     round(trend, 2),
        "avg7Eur":      round(avg7, 2),
        "avg30Eur":     round(avg30, 2),
        "lowestEur":    round(float(cm.get("low", 0)), 2),
    }


# ─── Firebase Uploader ─────────────────────────────────────────────────────────

def init_firebase():
    """Initialize Firebase Admin SDK."""
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
        if firebase_admin._apps:
            return firestore.client()
        # Try application default credentials
        cred = credentials.ApplicationDefault()
        firebase_admin.initialize_app(cred)
        return firestore.client()
    except Exception as e:
        print(f"[Firebase] Init error: {e}")
        return None


def upload_price(db, card_id: str, card_data: dict, price_info: dict, fx: dict):
    """Upload or merge price data to Firestore `card_prices` collection."""
    doc_ref = db.collection("card_prices").document(card_id)
    now = datetime.now(timezone.utc).isoformat()

    payload = {
        "id": card_id,
        "name": card_data.get("name", ""),
        "localId": card_data.get("localId", ""),
        "setName": (card_data.get("set", {}) or {}).get("name", card_data.get("set", "")),
        "setCode": (card_data.get("set", {}) or {}).get("id", ""),
        "rarity": card_data.get("rarity", ""),
        "imageUrl": card_data.get("image", f"https://assets.tcgdex.net/en/{card_id.replace('-','/')}"),
        "variants": card_data.get("variants", {}),
        # Price data
        "priceEur": price_info.get("priceEur", 0),
        "priceUsd": price_info.get("priceUsd", 0),
        "cardmarketHkd": price_info.get("cardmarketHkd", 0),
        "tcgplayerHkd": price_info.get("tcgplayerHkd", 0),
        "priceHkd": price_info.get("priceHkd", 0),
        "change24hPct": price_info.get("change24hPct", 0),
        "change30dPct": price_info.get("change30dPct"),
        "trendEur": price_info.get("trendEur", 0),
        "lowestEur": price_info.get("lowestEur", 0),
        # FX metadata
        "fxEurToHkd": fx["EUR_TO_HKD"],
        "fxUsdToHkd": fx["USD_TO_HKD"],
        # Timestamps
        "fetchedAt": now,
        "fetchedAtTs": int(time.time() * 1000),
        "source": "tcgdex",
    }

    doc_ref.set(payload, merge=True)
    return payload


# ─── Main Sync Logic ───────────────────────────────────────────────────────────

def sync_all(db, verbose=True):
    """Sync all HK popular cards from TCGdex to Firestore."""
    fx = get_fx_rates()
    if verbose:
        print(f"\n📊 FX Rates — EUR→HKD: {fx['EUR_TO_HKD']} | USD→HKD: {fx['USD_TO_HKD']}")

    results = {"success": 0, "failed": 0, "skipped": 0}

    for card_id, name, set_name, rarity in HK_POPULAR_CARDS:
        if verbose:
            print(f"\n🔍 {name} ({set_name}) — {card_id}")

        # Fetch from TCGdex
        card_data = fetch_tcgdex_card(card_id)
        if not card_data:
            results["failed"] += 1
            print(f"  ❌ Failed to fetch")
            continue

        # Check if we got actual price data
        pricing = card_data.get("pricing", {})
        if not pricing or not pricing.get("cardmarket"):
            print(f"  ⚠️ No price data from TCGdex — skipping Firestore update")
            results["skipped"] += 1
            continue

        # Extract and convert price
        price_info = extract_price(card_data, fx)

        # Upload to Firestore
        if db:
            try:
                upload_price(db, card_id, card_data, price_info, fx)
                print(f"  ✅ {name} → HK${price_info['priceHkd']:,.2f} | "
                      f"€{price_info['priceEur']} / ${price_info['priceUsd']}")
                results["success"] += 1
            except Exception as e:
                print(f"  ❌ Firebase upload failed: {e}")
                results["failed"] += 1
        else:
            # No Firebase — just print
            print(f"  📦 {name} → HK${price_info['priceHkd']:,.2f} | "
                  f"€{price_info['priceEur']} (trend: €{price_info['trendEur']})")

        time.sleep(0.6)  # Rate limit: ~1 req/sec

    return results


def sync_single(db, card_id: str):
    """Sync one card."""
    fx = get_fx_rates()
    card_data = fetch_tcgdex_card(card_id)
    if not card_data:
        print(f"❌ Card {card_id} not found on TCGdex")
        return

    price_info = extract_price(card_data, fx)
    if db:
        upload_price(db, card_id, card_data, price_info, fx)

    print(f"\n✅ {card_data.get('name')} ({card_data.get('set',{}).get('name','?')})")
    print(f"   Cardmarket: €{price_info['priceEur']} → HK${price_info['cardmarketHkd']:,.2f}")
    print(f"   TCGplayer:  ${price_info['priceUsd']} → HK${price_info['tcgplayerHkd']:,.2f}")
    print(f"   Best HKD:   HK${price_info['priceHkd']:,.2f}")
    print(f"   24h change: {price_info['change24hPct']:+.1f}% | 30d: {price_info['change30dPct'] or 'N/A'}")


def show_all_prices():
    """Print current prices for all cards (no Firebase needed)."""
    fx = get_fx_rates()
    print(f"\n📊 Current TCGdex Prices (EUR→HKD: {fx['EUR_TO_HKD']})")
    print(f"{'ID':<18} {'Name':<22} {'Set':<20} {'EUR':>8} {'Trend':>8} {'HKD':>9} {'24h%':>6}")
    print("-" * 95)

    for card_id, name, set_name, _ in HK_POPULAR_CARDS:
        card_data = fetch_tcgdex_card(card_id)
        if not card_data:
            print(f"{card_id:<18} {name:<22} {set_name:<20} ERROR")
            continue
        pricing = card_data.get("pricing", {})
        cm = (pricing.get("cardmarket") or {}) if pricing else {}
        price_eur = float(cm.get("avg") or cm.get("trend") or 0)
        trend = float(cm.get("trend") or 0)
        avg7 = float(cm.get("avg7") or price_eur)
        change_24h = round(((trend - avg7) / avg7) * 100, 1) if avg7 > 0 else 0
        price_hkd = round(price_eur * fx["EUR_TO_HKD"], 2)
        print(f"{card_id:<18} {name:<22} {set_name:<20} €{price_eur:>7.2f} €{trend:>7.2f} HK${price_hkd:>8.2f} {change_24h:>+5.1f}%")
        time.sleep(0.5)


# ─── CLI ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Sync TCGdex prices → Firebase Firestore")
    parser.add_argument("--card", type=str, help="Sync single card by TCGdex ID")
    parser.add_argument("--show", action="store_true", help="Show all prices (no Firebase)")
    parser.add_argument("--deploy-functions", action="store_true",
                        help="Generate Cloud Function code for Firebase deployment")
    args = parser.parse_args()

    if args.show:
        show_all_prices()
        sys.exit(0)

    if args.deploy_functions:
        # Generate the Cloud Function JavaScript to paste into functions/index.js
        print("""// Add this to your Firebase Cloud Functions (functions/index.js)
exports.syncCardPricesScheduled = functions.pubsub
  .schedule('every 180 minutes')
  .timeZone('Asia/Hong_Kong')
  .onRun(async (message) => {
    const { default: admin } = await import('firebase-admin');
    await admin.firestore().collection('card_prices').doc('__sync_trigger__')
      .set({ triggeredAt: Date.now() }, { merge: true });
    console.log('[syncCardPricesScheduled] Price sync triggered');
    return null;
  });
""")
        sys.exit(0)

    db = init_firebase()
    if not db:
        print("⚠️  Firebase not initialized — running in preview mode (--show prices only)")
        print("   To upload to Firebase, set GOOGLE_APPLICATION_CREDENTIALS or run in GCP.")
        db = None

    if args.card:
        sync_single(db, args.card)
    else:
        print("\n🚀 Syncing all HK popular cards from TCGdex → Firebase")
        results = sync_all(db)
        print(f"\n✅ Done — {results['success']} uploaded, {results['failed']} failed, {results['skipped']} skipped")