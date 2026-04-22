"""
Price Cache — Local JSON storage with TTL
Stores scraped price data with expiry for cache-aside pattern.
"""

import json
import os
import time
from dataclasses import dataclass, asdict
from typing import Optional
from datetime import datetime, timedelta, timezone

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "data")
CACHE_FILE = os.path.join(CACHE_DIR, "price_cache.json")
CACHE_TTL_SECONDS = 3600 * 6  # 6 hours


@dataclass
class CachedPrice:
    card_id: str
    name: str
    set_name: str
    price_hkd: float
    price_eur: Optional[float]
    price_usd: Optional[float]
    listing_count: int
    rarity: str
    trend_24h_pct: float
    fetched_at: str
    expires_at: str
    source: str  # 'cardmarket' | 'tcgplayer' | 'mock'

    def is_expired(self) -> bool:
        exp = datetime.fromisoformat(self.expires_at)
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) > exp


class PriceCache:
    def __init__(self, cache_file: str = CACHE_FILE):
        self.cache_file = cache_file
        self._ensure_dir()
        self._data: dict[str, dict] = self._load()

    def _ensure_dir(self):
        os.makedirs(os.path.dirname(self.cache_file), exist_ok=True)

    def _load(self) -> dict:
        if not os.path.exists(self.cache_file):
            return {}
        try:
            with open(self.cache_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {}

    def _save(self):
        with open(self.cache_file, "w", encoding="utf-8") as f:
            json.dump(self._data, f, ensure_ascii=False, indent=2)

    def get(self, card_id: str) -> Optional[CachedPrice]:
        raw = self._data.get(card_id)
        if not raw:
            return None
        cp = CachedPrice(**raw)
        return cp if not cp.is_expired() else None

    def set(self, price: CachedPrice):
        self._data[price.card_id] = asdict(price)
        self._save()

    def get_all(self) -> list[CachedPrice]:
        results = []
        for raw in self._data.values():
            cp = CachedPrice(**raw)
            if not cp.is_expired():
                results.append(cp)
        return results

    def get_stale(self, max_age_hours: int = 24) -> list[CachedPrice]:
        """Get entries older than max_age_hours (for refresh)"""
        cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
        results = []
        for raw in self._data.values():
            cp = CachedPrice(**raw)
            fetched_ts = datetime.fromisoformat(cp.fetched_at)
            if fetched_ts.tzinfo is None:
                fetched_ts = fetched_ts.replace(tzinfo=timezone.utc)
            if fetched_ts < cutoff:
                results.append(cp)
        return results

    def get_stats(self) -> dict:
        total = len(self._data)
        expired = sum(1 for r in self._data.values() if CachedPrice(**r).is_expired())
        return {
            "total": total,
            "fresh": total - expired,
            "expired": expired,
            "cache_file": self.cache_file,
        }

    def clear_expired(self):
        before = len(self._data)
        self._data = {
            k: v for k, v in self._data.items()
            if not CachedPrice(**v).is_expired()
        }
        removed = before - len(self._data)
        if removed:
            self._save()
        return removed
