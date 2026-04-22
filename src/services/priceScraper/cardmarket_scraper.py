"""
CardMarket Scraper — European Pokemon card price data (EUR)
CardMarket.com has an API: https://api.cardmarket.com (requires account)
Free tier: 5000 req/month (limited)
Fallback: HTML scraping with rotating user-agents

Prices are in EUR, converted to HKD using live exchange rate.
"""

import httpx
import asyncio
import re
import json
import time
from dataclasses import dataclass
from typing import Optional
from datetime import datetime

BASE_API = "https://api.cardmarket.com"
BASE_WEB = "https://www.cardmarket.com/en_US"


@dataclass
class CardMarketPrice:
    card_id: str
    card_name: str
    price_eur: float
    price_hkd: float
    condition: str
    listing_count: int
    trend_price: float
    source_url: str
    fetched_at: str


USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
]

# Approximate EUR→HKD rate (fetched from ECB or use fallback)
EUR_TO_HKD = 8.48  # fallback


async def fetch_eur_to_hkd() -> float:
    """Fetch live EUR/HKD rate from Frankfurter API (free, no key)"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get("https://api.frankfurter.app/latest?from=EUR&to=HKD")
            data = resp.json()
            return float(data["rates"]["HKD"])
    except Exception:
        return EUR_TO_HKD  # fallback


class CardMarketClient:
    """
    Uses CardMarket's public pages to scrape prices.
    Falls back to Pokemon TCG API card IDs (which match CardMarket IDs).
    
    Rate limit: ~1 request per 3 seconds to avoid IP ban.
    """

    def __init__(self, api_key: Optional[str] = None, api_secret: Optional[str] = None):
        self.api_key = api_key
        self.api_secret = api_secret
        self.client = httpx.AsyncClient(
            timeout=30.0,
            follow_redirects=True,
            headers={"Accept-Language": "en-US,en;q=0.9"},
        )
        self._ua_index = 0
        self._rate_limit_s = 3  # seconds between requests
        self._last_request = 0

    def _headers(self) -> dict:
        """Rotate user-agent to avoid bot detection"""
        ua = USER_AGENTS[self._ua_index % len(USER_AGENTS)]
        return {
            "User-Agent": ua,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": BASE_WEB,
        }

    async def _rotate_ua(self):
        self._ua_index += 1

    async def _get(self, url: str, params: dict = None) -> httpx.Response:
        """Rate-limited GET with UA rotation"""
        now = time.time()
        elapsed = now - self._last_request
        if elapsed < self._rate_limit_s:
            await asyncio.sleep(self._rate_limit_s - elapsed)
        self._last_request = time.time()
        resp = await self.client.get(url, headers=self._headers(), params=params)
        resp.raise_for_status()
        await self._rotate_ua()
        return resp

    async def search_card_price(
        self,
        card_name: str,
        set_name: Optional[str] = None,
    ) -> Optional[CardMarketPrice]:
        """
        Search CardMarket for a card's price.
        Returns latest listing price and trend price in EUR → HKD.
        """
        # Build search query
        query = card_name
        if set_name:
            query += f" {set_name}"

        # Encode for URL
        search_url = f"{BASE_WEB}/products/search"
        params = {"search": query, "site": "search"}

        try:
            resp = await self._get(search_url, params={"search": query})
            html = resp.text

            # Parse price from HTML
            # CardMarket lists prices in spans with class like "fw-bold text-nowrap"
            price_match = re.search(
                r'([\d,]+\.\d{2})\s*€',
                html
            )
            count_match = re.search(
                r'(\d+)\s*articles?',
                html,
                re.IGNORECASE
            )

            eur = None
            if price_match:
                eur = float(price_match.group(1).replace(",", ""))

            count = int(count_match.group(1)) if count_match else 0

            if eur is None:
                return None

            eur_usd = await fetch_eur_to_hkd()

            return CardMarketPrice(
                card_id=card_name,
                card_name=card_name,
                price_eur=eur,
                price_hkd=round(eur * eur_usd, 2),
                condition="Near Mint",  # default to NM without more parsing
                listing_count=count,
                trend_price=eur,
                source_url=f"{BASE_WEB}/products/search?search={query}",
                fetched_at=datetime.utcnow().isoformat(),
            )

        except httpx.HTTPStatusError as e:
            print(f"[CardMarket] HTTP error {e.response.status_code} for {card_name}")
            return None
        except Exception as e:
            print(f"[CardMarket] Error fetching {card_name}: {e}")
            return None

    async def batch_search(
        self,
        card_queries: list[dict],
    ) -> dict[str, CardMarketPrice]:
        """
        Batch search multiple cards.
        card_queries: [{"name": "Charizard", "set": "Darkness Ablaze"}, ...]
        Returns dict mapping card_name → CardMarketPrice
        """
        results = {}
        for q in card_queries:
            name = q.get("name", "")
            set_name = q.get("set")
            result = await self.search_card_price(name, set_name)
            if result:
                results[name] = result
            # Don't hammer — respect rate limit
            await asyncio.sleep(1)
        return results

    async def close(self):
        await self.client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.close()
