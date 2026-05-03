#!/usr/bin/env python3
"""
PokeMarket — Full TCGdex → Firestore Bulk Sync
Fetches ALL cards from ALL TCGdex sets and uploads to Firestore card_prices.

Usage:
  GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json python3 sync_all_cards.py

Rate limit: 0.6s between requests (~1 req/sec)
Expected time: ~3-4 hours for all 20,000 cards
"""

import urllib.request
import json
import time
import os
import sys
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

# ─── Config ─────────────────────────────────────────────────────────────────────
SA_KEY = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS",
                        os.path.expanduser("~/.config/firebase/pokemarket-key.json"))
FX_URL = "https://api.frankfurter.app/latest?from=EUR&to=HKD"
TCGDEX_BASE = "https://api.tcgdex.net/v2/en"
BATCH_SIZE = 30        # Firestore 'in' query limit
RATE_LIMIT = 0.65      # seconds between TCGdex requests
REPORT_EVERY = 50       # log progress every N cards
REPORT_SET_EVERY = 3   # log progress every N sets

# ─── FX ────────────────────────────────────────────────────────────────────────
def get_fx():
    try:
        with urllib.request.urlopen(FX_URL, timeout=8) as r:
            data = json.loads(r.read())
        eur_to_hkd = float(data["rates"]["HKD"])
        print(f"[FX] Live rate: EUR→HKD {eur_to_hkd}")
        return {"EUR_TO_HKD": eur_to_hkd, "USD_TO_HKD": eur_to_hkd / 1.08}
    except Exception as e:
        print(f"[FX] Fallback: 8.48 — {e}")
        return {"EUR_TO_HKD": 8.48, "USD_TO_HKD": 7.78}

# ─── Firebase ────────────────────────────────────────────────────────────────
def init_firebase():
    import firebase_admin
    from firebase_admin import credentials, firestore
    if firebase_admin._apps:
        return firestore.client()
    cred = credentials.Certificate(
        os.environ.get("GOOGLE_APPLICATION_CREDENTIALS",
                       "/home/user/.openclaw/workspace/pokemarket-sa.json"))
    firebase_admin.initialize_app(cred)
    print("[Firebase] Initialized ✓")
    return firestore.client()

# ─── TCGdex ────────────────────────────────────────────────────────────────────
def tcgdex_get(path: str) -> dict | list | None:
    url = f"{TCGDEX_BASE}/{path}"
    try:
        with urllib.request.urlopen(url, timeout=12) as r:
            return json.loads(r.read())
    except Exception as e:
        return None

def get_all_sets() -> list[dict]:
    sets = tcgdex_get("sets")
    return sets if isinstance(sets, list) else []

def get_cards_in_set(set_id: str) -> list[dict]:
    """Fetch all cards for a set. TCGdex /set endpoint returns all cards (no pagination)."""
    cards = tcgdex_get(f"sets/{set_id}")
    if not isinstance(cards, dict):
        return []
    return cards.get("cards", [])

def get_pricing(card_id: str) -> dict | None:
    data = tcgdex_get(f"cards/{card_id}")
    if not isinstance(data, dict):
        return None
    pricing = data.get("pricing", {})
    cm = (pricing.get("cardmarket") or {}) if pricing else {}
    tcg = (pricing.get("tcgplayer") or {}) if pricing else {}
    return {
        "data": data,
        "priceEur":     round(float(cm.get("avg") or cm.get("trend") or cm.get("low") or 0), 2),
        "priceUsd":     round(float(tcg.get("averagePrice") or tcg.get("marketPrice") or 0), 2),
        "trendEur":     round(float(cm.get("trend") or 0), 2),
        "lowestEur":    round(float(cm.get("low") or 0), 2),
        "avg7Eur":      round(float(cm.get("avg7") or 0), 2),
        "avg30Eur":     round(float(cm.get("avg30") or 0), 2),
        "change24hPct": 0.0,
    }

# ─── Price Conversion ─────────────────────────────────────────────────────────
def convert_price(p: dict, fx: dict) -> dict:
    cm_hkd = round(p["priceEur"] * fx["EUR_TO_HKD"], 2)
    tc_hkd = round(p["priceUsd"] * fx["USD_TO_HKD"], 2)
    p["cardmarketHkd"] = cm_hkd
    p["tcgplayerHkd"] = tc_hkd
    p["priceHkd"] = max(cm_hkd, tc_hkd)
    if p["avg7Eur"] > 0:
        p["change24hPct"] = round(((p["trendEur"] - p["avg7Eur"]) / p["avg7Eur"]) * 100, 1)
    return p

# ─── Firestore Batch Upload ──────────────────────────────────────────────────
def upload_batch(db, cards: list[dict], fx: dict, set_id: str, set_name: str):
    """Upload a batch of cards to Firestore using batched writes."""
    if not cards:
        return 0
    from firebase_admin import firestore as fs
    batch = db.batch()
    now = datetime.now(timezone.utc)
    now_ts = int(time.time() * 1000)

    count = 0
    for card in cards:
        doc_id = card["id"]
        p = card["pricing"]
        doc_ref = db.collection("card_prices").document(doc_id)
        batch.set(doc_ref, {
            "id": doc_id,
            "name": card.get("name", ""),
            "localId": card.get("localId", ""),
            "set": set_name,
            "setCode": set_id,
            "rarity": card.get("rarity", ""),
            "imageUrl": card.get("image", ""),
            "number": card.get("number", ""),
            "series": card.get("series", ""),
            "priceEur": p.get("priceEur", 0),
            "priceUsd": p.get("priceUsd", 0),
            "cardmarketHkd": p.get("cardmarketHkd", 0),
            "tcgplayerHkd": p.get("tcgplayerHkd", 0),
            "priceHkd": p.get("priceHkd", 0),
            "change24hPct": p.get("change24hPct", 0),
            "trendEur": p.get("trendEur", 0),
            "lowestEur": p.get("lowestEur", 0),
            "fxEurToHkd": fx["EUR_TO_HKD"],
            "fxUsdToHkd": fx["USD_TO_HKD"],
            "fetchedAt": now.isoformat(),
            "fetchedAtTs": now_ts,
            "source": "tcgdex",
        }, merge=True)
        count += 1

        # Firestore batch limit = 500 ops, flush if full
        if count % 500 == 0:
            batch.commit()
            batch = db.batch()

    batch.commit()
    return count

# ─── Main Sync ────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("PokeMarket Full TCGdex → Firestore Sync")
    print("=" * 60)

    fx = get_fx()
    db = init_firebase()

    # Get all sets from TCGdex
    print("\n📡 Fetching all TCGdex sets...")
    all_sets = get_all_sets()
    print(f"   Found {len(all_sets)} sets")

    total_cards = 0
    total_uploaded = 0
    total_failed = 0
    set_stats = []

    for i, s in enumerate(all_sets):
        set_id = s["id"]
        set_name = s.get("name", set_id)
        card_count = s.get("cardCount", {}).get("total", 0)

        if card_count == 0:
            continue

        # Check what's already in Firestore for this set
        existing_count = 0
        try:
            snaps = db.collection("card_prices").where("setCode", "==", set_id).get()
            existing_count = len(snaps)
        except:
            pass

        is_new = existing_count == 0
        pct_done = f"{existing_count}/{card_count}" if not is_new else "NEW"
        print(f"\n[{i+1}/{len(all_sets)}] {set_id} — {set_name} ({card_count} cards, {pct_done})")

        if not is_new and existing_count >= card_count * 0.9:
            print(f"   ✅ Already synced ({existing_count}/{card_count}), skipping")
            total_cards += card_count
            total_uploaded += existing_count
            continue

        # Fetch all cards in set
        cards = get_cards_in_set(set_id)
        if not cards:
            print(f"   ⚠️ No cards returned for set {set_id}")
            set_stats.append((set_id, "NO_CARDS", 0))
            continue

        print(f"   📦 {len(cards)} cards in set")

        # Fetch pricing for each card
        batch_to_upload = []
        for card in cards:
            card_id = card.get("id") or card.get("localId", "")
            if not card_id:
                continue

            # Skip if already has price and was synced recently
            try:
                doc = db.collection("card_prices").document(card_id).get()
                if doc.exists:
                    p = doc.to_dict()
                    if p.get("priceHkd", 0) > 0 and p.get("fetchedAtTs", 0) > (time.time() - 86400) * 1000:
                        continue  # skip recently synced cards
            except:
                pass

            # Fetch pricing
            price_data = get_pricing(card_id)
            if not price_data:
                continue

            card["pricing"] = convert_price(price_data, fx)
            batch_to_upload.append(card)

            total_cards += 1
            if total_cards % REPORT_EVERY == 0:
                print(f"   📊 Progress: {total_cards} cards processed, {total_uploaded} uploaded")

            time.sleep(RATE_LIMIT)

        # Batch upload
        if batch_to_upload:
            # Process in sub-batches of 30 for Firestore limits
            for j in range(0, len(batch_to_upload), BATCH_SIZE):
                sub_batch = batch_to_upload[j:j+BATCH_SIZE]
                n = upload_batch(db, sub_batch, fx, set_id, set_name)
                total_uploaded += n

            print(f"   ✅ Uploaded {len(batch_to_upload)} cards from {set_id}")

        # Save set progress
        set_stats.append((set_id, set_name, len(batch_to_upload)))

    # ── Final Report ──
    print("\n" + "=" * 60)
    print("📊 FINAL SYNC REPORT")
    print("=" * 60)
    print(f"   Total cards processed: {total_cards}")
    print(f"   Total uploaded:        {total_uploaded}")
    print(f"   Total failed:          {total_failed}")
    print(f"   Time: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 60)

if __name__ == "__main__":
    main()
