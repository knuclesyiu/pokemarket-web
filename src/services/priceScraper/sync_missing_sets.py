#!/usr/bin/env python3
"""
PokeMarket — Sync ONLY the 52 missing sets
Fetches each set's cards from TCGdex, then fetches pricing per card.
~6,654 cards total, ~0.65s per price fetch = ~72 min runtime

Usage:
  GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json python3 sync_missing_sets.py
"""

import urllib.request, json, time, os
from datetime import datetime, timezone

SA_KEY = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS",
                        "/home/user/.openclaw/workspace/pokemarket-sa.json")
FX_URL = "https://api.frankfurter.app/latest?from=EUR&to=HKD"
RATE = 0.65   # TCGdex req/sec

def get_fx():
    try:
        with urllib.request.urlopen(FX_URL, timeout=8) as r:
            d = json.loads(r.read())
        fx = float(d["rates"]["HKD"])
        print(f"[FX] EUR→HKD {fx}")
        return fx
    except:
        print("[FX] fallback 8.48")
        return 8.48

def init_fb():
    import firebase_admin
    from firebase_admin import credentials, firestore
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(SA_KEY))
    print("[Firebase] OK")
    return firestore.client()

def tcgdex(path):
    try:
        with urllib.request.urlopen(f"https://api.tcgdex.net/v2/en/{path}", timeout=12) as r:
            return json.loads(r.read())
    except:
        return None

def get_all_sets():
    sets = tcgdex("sets")
    return sets if isinstance(sets, list) else []

def main():
    fx_rate = get_fx()
    db = init_fb()

    all_sets = get_all_sets()
    print(f"TCGdex has {len(all_sets)} sets total")

    # Get existing set codes
    existing = set()
    snap = db.collection("card_prices").get()
    for d in snap:
        sc = d.to_dict().get("setCode", "")
        if sc: existing.add(sc)

    # Find missing
    missing = [s for s in all_sets if s["id"] not in existing]
    print(f"Missing sets: {len(missing)}")

    total_uploaded = 0
    total_cards = 0
    total_fail = 0

    for i, s in enumerate(missing):
        set_id = s["id"]
        set_name = s.get("name", set_id)
        total_in_set = s.get("cardCount", {}).get("total", 0)
        print(f"\n[{i+1}/{len(missing)}] {set_id} — {set_name} ({total_in_set} cards)")

        # Fetch all cards in set (no pricing yet)
        set_data = tcgdex(f"sets/{set_id}")
        if not isinstance(set_data, dict):
            print(f"  ❌ Failed to fetch set")
            continue

        cards = set_data.get("cards", [])
        if not cards:
            print(f"  ⚠️ No cards")
            continue

        print(f"  📦 {len(cards)} cards, fetching prices...")

        # Upload each card with pricing
        uploaded = 0
        for card in cards:
            cid = card.get("id") or card.get("localId", "")
            if not cid:
                continue

            # Skip if already exists with price
            try:
                doc_snap = db.collection("card_prices").document(cid).get()
                if doc_snap.exists and doc_snap.to_dict().get("priceHkd", 0) > 0:
                    continue
            except:
                pass

            # Fetch pricing
            price_data = tcgdex(f"cards/{cid}")
            if not price_data:
                total_fail += 1
                continue

            pricing = price_data.get("pricing", {})
            cm = (pricing.get("cardmarket") or {}) if pricing else {}
            tcg = (pricing.get("tcgplayer") or {}) if pricing else {}

            price_eur = round(float(cm.get("avg") or cm.get("trend") or cm.get("low") or 0), 2)
            price_usd = round(float(tcg.get("averagePrice") or tcg.get("marketPrice") or 0), 2)
            trend     = round(float(cm.get("trend") or 0), 2)
            low       = round(float(cm.get("low") or 0), 2)
            avg7      = round(float(cm.get("avg7") or 0), 2)
            avg30     = round(float(cm.get("avg30") or 0), 2)

            cm_hkd = round(price_eur * fx_rate, 2)
            tc_hkd = round(price_usd * (fx_rate / 1.08), 2)
            best_hkd = max(cm_hkd, tc_hkd)

            change24h = 0.0
            if avg7 > 0 and trend > 0:
                change24h = round(((trend - avg7) / avg7) * 100, 1)

            # Upload
            try:
                db.collection("card_prices").document(cid).set({
                    "id": cid,
                    "name": card.get("name", ""),
                    "localId": card.get("localId", ""),
                    "set": set_name,
                    "setCode": set_id,
                    "rarity": card.get("rarity", ""),
                    "imageUrl": card.get("image", ""),
                    "number": card.get("number", ""),
                    "series": card.get("series", ""),
                    "language": card.get("language", ""),
                    "priceEur": price_eur,
                    "priceUsd": price_usd,
                    "cardmarketHkd": cm_hkd,
                    "tcgplayerHkd": tc_hkd,
                    "priceHkd": best_hkd,
                    "change24hPct": change24h,
                    "trendEur": trend,
                    "lowestEur": low,
                    "avg7Eur": avg7,
                    "avg30Eur": avg30,
                    "fxEurToHkd": fx_rate,
                    "fetchedAt": datetime.now(timezone.utc).isoformat(),
                    "fetchedAtTs": int(time.time() * 1000),
                    "source": "tcgdex",
                }, merge=True)
                uploaded += 1
                total_uploaded += 1
            except Exception as e:
                print(f"  ⚠️ Upload error {cid}: {e}")
                total_fail += 1

            total_cards += 1
            time.sleep(RATE)

        print(f"  ✅ Uploaded {uploaded} cards from {set_id}")

        # Progress every 5 sets
        if (i + 1) % 5 == 0:
            print(f"\n📊 Progress: {total_uploaded} uploaded, {total_fail} failed, {total_cards} processed")
            print(f"   Estimated: {i+1}/{len(missing)} sets done")

    # Final report
    print("\n" + "=" * 50)
    print("FINAL: uploaded={} failed={} cards={}".format(total_uploaded, total_fail, total_cards))
    print("=" * 50)

if __name__ == "__main__":
    main()