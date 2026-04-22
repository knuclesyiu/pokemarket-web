#!/usr/bin/env python3
"""
Pokemon Card Price Scraper — CLI

Usage:
    cd PokeTrader && uv run --with httpx python3 -m src.services.priceScraper.main --help
    uv run --with httpx python3 -m src.services.priceScraper.main --seed
    uv run --with httpx python3 -m src.services.priceScraper.main --card "Charizard VMAX"
    uv run --with httpx python3 -m src.services.priceScraper.main --refresh
    uv run --with httpx python3 -m src.services.priceScraper.main --export
    uv run --with httpx python3 -m src.services.priceScraper.main --stats
"""

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))

from src.services.priceScraper.pokemon_tcg_api import PokemonTCGClient, TCGCard
from src.services.priceScraper.cardmarket_scraper import CardMarketClient, fetch_eur_to_hkd
from src.services.priceScraper.price_cache import PriceCache, CachedPrice
from src.services.priceScraper.popular_cards import get_popular_card_list, SEED_PRICES_HKD

CACHE: Optional[PriceCache] = None

def get_cache() -> PriceCache:
    global CACHE
    if CACHE is None:
        CACHE = PriceCache()
    return CACHE


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def future_iso(hours: int = 6) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()


def _match_seed(name: str) -> Optional[dict]:
    """Match a card name against SEED_PRICES_HKD by partial name"""
    search = name.lower().replace("vmax", "").replace("gx", "").replace("vstar", "").strip()
    for seed_id, data in SEED_PRICES_HKD.items():
        if search in seed_id.lower() or seed_id.lower().replace("-", "").startswith(search.replace(" ", "")):
            return data
    return None


async def scrape_single_card(
    name: str,
    set_name: Optional[str] = None,
    use_cache: bool = True,
) -> Optional[CachedPrice]:
    """Scrape metadata + price for a single card"""
    cache = get_cache()

    # ── 1. Check cache ──────────────────────────────────────────────
    if use_cache:
        # Try by name match
        for cp in cache.get_all():
            if cp.name.lower() == name.lower():
                print(f"  [CACHE HIT] {name} → HK$ {cp.price_hkd:,.0f}")
                return cp

    # ── 2. Pokemon TCG API (card metadata — free, no key needed) ────
    try:
        async with PokemonTCGClient() as tcg:
            cards = await tcg.search_cards(name)
        if not cards:
            print(f"  [NOT FOUND] {name}")
            return None

        # If set specified, pick best match
        if set_name:
            card: TCGCard = next(
                (c for c in cards if set_name.lower() in c.set_name.lower()),
                cards[0]
            )
        else:
            card = cards[0]
    except Exception as e:
        print(f"  [TCG API ERROR] {name}: {e}")
        return None

    # ── 3. CardMarket price (may be blocked by 403/Cloudflare) ───────
    cm_price = None
    try:
        async with CardMarketClient() as cm:
            cm_price = await cm.search_card_price(name, set_name)
    except Exception:
        pass  # graceful fallback

    # ── 4. Resolve price ─────────────────────────────────────────────
    seed = _match_seed(name)
    eur_to_hkd = await fetch_eur_to_hkd()

    if cm_price and cm_price.price_eur:
        price_hkd = cm_price.price_hkd
        source = "cardmarket"
        change_24h = cm_price.price_eur  # would need history for delta
    elif seed:
        price_hkd = seed["price"]
        source = "seed"
        change_24h = seed.get("change_24h", 0.0)
    else:
        price_hkd = 0
        source = "unavailable"
        change_24h = 0.0

    # ── 5. Save to cache ────────────────────────────────────────────
    cp = CachedPrice(
        card_id=card.id,
        name=card.name,
        set_name=card.set_name,
        price_hkd=price_hkd,
        price_eur=cm_price.price_eur if cm_price else None,
        price_usd=None,
        listing_count=seed.get("listings", 1) if seed else 1,
        rarity=card.rarity,
        trend_24h_pct=change_24h,
        fetched_at=now_iso(),
        expires_at=future_iso(6),
        source=source,
    )
    cache.set(cp)

    print(f"  [OK] {card.name} ({card.set_name}) → HK$ {price_hkd:,.0f} [{source}]")
    return cp


async def refresh_all() -> dict:
    """Refresh all HK popular cards"""
    cache = get_cache()
    cards = get_popular_card_list()
    results = {"success": 0, "skipped": 0, "failed": 0}

    print(f"\n🔄 Refreshing {len(cards)} popular HK cards...\n")
    for i, card_info in enumerate(cards):
        name = card_info["name"]
        set_name = card_info.get("set")

        # Skip if fresh in cache
        for cp in cache.get_all():
            if cp.name.lower() == name.lower() and not cp.is_expired():
                print(f"  [SKIP] {name} (fresh)")
                results["skipped"] += 1
                break
        else:
            try:
                await scrape_single_card(name, set_name, use_cache=False)
                results["success"] += 1
            except Exception as e:
                print(f"  [FAIL] {name}: {e}")
                results["failed"] += 1

        await asyncio.sleep(1.5)  # be polite

    print(f"\n✅ Done — {results['success']} scraped, {results['skipped']} cached, {results['failed']} failed")
    return results


async def export_prices(output_file: str = "data/prices_latest.json") -> dict:
    """Export cached prices to JSON for app consumption"""
    cache = get_cache()
    prices = cache.get_all()
    eur_to_hkd = await fetch_eur_to_hkd()

    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
    export_path = os.path.join(project_root, output_file)
    os.makedirs(os.path.dirname(export_path), exist_ok=True)

    data = {
        "exported_at": now_iso(),
        "eur_to_hkd": eur_to_hkd,
        "count": len(prices),
        "prices": [p.__dict__ for p in prices],
    }
    with open(export_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"📦 Exported {len(prices)} prices → {export_path}")
    return data


def show_stats():
    cache = get_cache()
    stats = cache.get_stats()
    stale = cache.get_stale(max_age_hours=24)

    print(f"\n📊 Price Cache")
    print(f"   Total: {stats['total']} | Fresh: {stats['fresh']} | Expired: {stats['expired']}")
    print(f"   Stale (>24h): {len(stale)}")

    if stale:
        print("   Stale cards:")
        for p in stale[:8]:
            print(f"   - {p.name} ({p.set_name}) — {p.source}")

    return stats


def seed_cache():
    """Pre-populate cache with HK popular card seed prices"""
    cache = get_cache()
    from src.services.priceScraper.popular_cards import POPULAR_CARDS_HK

    count = 0
    for card_id, price_data in SEED_PRICES_HKD.items():
        matched = next(
            ((name, set_name) for name, set_name, cid in POPULAR_CARDS_HK if cid == card_id),
            (card_id, "Unknown")
        )
        name, set_name = matched

        cp = CachedPrice(
            card_id=card_id,
            name=name,
            set_name=set_name,
            price_hkd=price_data["price"],
            price_eur=None,
            price_usd=None,
            listing_count=price_data.get("listings", 1),
            rarity="Rare Ultra",
            trend_24h_pct=price_data.get("change_24h", 0.0),
            fetched_at=now_iso(),
            expires_at=future_iso(24),
            source="seed",
        )
        cache.set(cp)
        count += 1

    print(f"✅ Seeded {count} prices")
    show_stats()


def main():
    parser = argparse.ArgumentParser(description="PokeMarket Price Scraper")
    g = parser.add_mutually_exclusive_group()
    g.add_argument("--seed", action="store_true", help="Seed cache with HK popular cards")
    g.add_argument("--stats", action="store_true", help="Show cache stats")
    g.add_argument("--clear-expired", action="store_true", help="Remove expired entries")
    g.add_argument("--refresh", action="store_true", help="Refresh all popular cards from web")
    g.add_argument("--card", type=str, help="Scrape single card by name")
    g.add_argument("--export", action="store_true", help="Export prices to JSON")
    args = parser.parse_args()

    if args.seed:
        seed_cache()
    elif args.stats:
        show_stats()
    elif args.clear_expired:
        removed = get_cache().clear_expired()
        print(f"🗑️ Cleared {removed} expired entries")
    elif args.card:
        asyncio.run(scrape_single_card(args.card))
    elif args.refresh:
        asyncio.run(refresh_all())
    elif args.export:
        asyncio.run(export_prices())
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
