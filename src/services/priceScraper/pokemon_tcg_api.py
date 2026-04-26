"""
Pokemon TCG API — Free card metadata (names, images, rarity, sets)
No API key required. Rate limit: ~100 req/min
"""

import httpx
import asyncio
from typing import Optional
from dataclasses import dataclass
import time

BASE_URL = "https://api.pokemontcg.io/v2"
RATE_LIMIT_MS = 600  # stay under 100 req/min


@dataclass
class TCGCard:
    id: str
    name: str
    set_name: str
    set_code: str
    rarity: str
    number: str
    series: str
    image_url: str
    small_image: str


class PokemonTCGClient:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=30.0)
        self._last_request = 0

    async def _get(self, endpoint: str, params: dict = None) -> dict:
        """Rate-limited GET request"""
        now = time.time() * 1000
        elapsed = now - self._last_request
        if elapsed < RATE_LIMIT_MS:
            await asyncio.sleep((RATE_LIMIT_MS - elapsed) / 1000)
        self._last_request = time.time() * 1000
        resp = await self.client.get(f"{BASE_URL}{endpoint}", params=params)
        resp.raise_for_status()
        return resp.json()

    async def search_cards(
        self,
        query: str,
        rarity: Optional[str] = None,
        page_size: int = 20,
        page: int = 1,
    ) -> list[TCGCard]:
        """Search cards by name query"""
        # Pokemon TCG API v2 — multi-word values must be quoted
        # Format: q="name:\"Charizard VMAX\"" 
        import urllib.parse
        q_parts = []
        if query:
            q_parts.append(f'name:\"{query}\"')
        if rarity:
            q_parts.append(f'rarity:\"{rarity}\"')
        params = {
            "q": " ".join(q_parts),
            "pageSize": page_size,
            "page": page,
            "orderBy": "-releaseDate",
        }

        data = await self._get("/cards", params=params)
        raw_cards = data.get("data", [])

        return [
            TCGCard(
                id=c.get("id", ""),
                name=c.get("name", ""),
                set_name=c.get("set", {}).get("name", ""),
                set_code=c.get("set", {}).get("id", ""),
                rarity=c.get("rarity", ""),
                number=c.get("number", ""),
                series=c.get("series", ""),
                image_url=c.get("images", {}).get("large", ""),
                small_image=c.get("images", {}).get("small", ""),
            )
            for c in raw_cards
        ]

    async def get_card_by_id(self, card_id: str) -> Optional[TCGCard]:
        """Get single card by exact ID"""
        try:
            data = await self._get(f"/cards/{card_id}")
            c = data.get("data", {})
            return TCGCard(
                id=c.get("id", ""),
                name=c.get("name", ""),
                set_name=c.get("set", {}).get("name", ""),
                set_code=c.get("set", {}).get("id", ""),
                rarity=c.get("rarity", ""),
                number=c.get("number", ""),
                series=c.get("series", ""),
                image_url=c.get("images", {}).get("large", ""),
                small_image=c.get("images", {}).get("small", ""),
            )
        except httpx.HTTPStatusError:
            return None

    async def get_popular_cards(self, set_code: Optional[str] = None, limit: int = 50) -> list[TCGCard]:
        """Get popular/recent cards from a set"""
        params = {"pageSize": min(limit, 100), "orderBy": "-releaseDate"}
        endpoint = "/cards"
        if set_code:
            endpoint = f"/sets/{set_code}/cards"

        data = await self._get(endpoint, params=params)
        raw_cards = data.get("data", [])

        return [
            TCGCard(
                id=c.get("id", ""),
                name=c.get("name", ""),
                set_name=c.get("set", {}).get("name", ""),
                set_code=c.get("set", {}).get("id", ""),
                rarity=c.get("rarity", ""),
                number=c.get("number", ""),
                series=c.get("series", ""),
                image_url=c.get("images", {}).get("large", ""),
                small_image=c.get("images", {}).get("small", ""),
            )
            for c in raw_cards
        ]

    async def close(self):
        await self.client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.close()
