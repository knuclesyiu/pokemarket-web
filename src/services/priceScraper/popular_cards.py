"""
Most popular / traded Pokemon cards in HK market.
Used to bootstrap the scraper with known high-value cards.
"""

# (card_name, set_name, cardmarket_id)
POPULAR_CARDS_HK = [
    # Sword & Shield — VMAX
    ("Charizard VMAX", "Darkness Ablaze", "swsh5-115"),
    ("Gengar VMAX", "Evolving Skies", "swsh12-71"),
    ("Mewtwo VMAX", "Vivid Voltage", "swsh8-115"),
    ("Tyranitar VMAX", "Battle Styles", "swsh4-116"),
    ("Umbreon VMAX", "Evolving Skies", "swsh12-215"),
    ("Rayquaza VMAX", "Champion's Path", "swsh3-76"),
    ("Dragapult VMAX", "Rebel Clash", "swsh2-239"),
    ("Lugia VSTAR", "Astral Radiance", "swsh9-138"),
    ("Mew VSTAR", "Astral Radiance", "swsh9-132"),
    ("Arceus VSTAR", "Brilliant Stars", "swsh11-122"),
    ("Charizard VSTAR", "Brilliant Stars", "swsh11-221"),
    ("Giratina VSTAR", "Lost Origin", "swsh21-143"),
    ("Pikachu VMAX", "Vivid Voltage", "swsh8-44"),
    ("Eevee VMAX", "Vivid Voltage", "swsh8-eevee"),
    ("Snorlax VMAX", "Rebel Clash", "swsh2-143"),
    # Sun & Moon — GX
    ("Mewtwo-GX", "Hidden Fates", "sm115-68"),
    ("Charizard-GX", "Burning Shadows", "sm51-23"),
    ("Garchomp-GX", "Crimson Invasion", "sm65-86"),
    ("Mimikyu-GX", "Burning Shadows", "sm51-57"),
    ("Gardevoir-GX", "Ancient Origins", "sm78-94"),
    # Japanese exclusives (high demand in HK)
    ("Umbreon VMAX", "VSTAR Universe", "swsh12-UV"),
    ("Espeon VMAX", "VSTAR Universe", "swsh12-espeon"),
    ("Shiny Charizard VMAX", "Shiny Vault", "swsh5-SV"),
    ("Shiny Gengar VMAX", "Shiny Vault", "swsh12-SV"),
    # Base Set — OG grailles
    ("Charizard 1st Edition", "Base Set", "base4-4"),
    ("Blastoise 1st Edition", "Base Set", "base4-2"),
    ("Venusaur 1st Edition", "Base Set", "base4-15"),
    ("Charizard Shadowless", "Base Set Shadowless", "base4-shadowless"),
    # PSA graded cards (HK market staple)
    ("Charizard PSA 10", "Base Set", "psa10-charizard"),
    ("Mewtwo PSA 9", "Jungle", "psa9-mewtwo"),
]

# Pre-seeded market prices in HKD (for cards without live data)
# Updated manually or via last scrape
SEED_PRICES_HKD: dict[str, dict] = {
    "swsh5-115": {"price": 4280, "change_24h": 8.4, "listings": 23},
    "swsh12-71": {"price": 3150, "change_24h": 12.1, "listings": 14},
    "swsh8-115": {"price": 1890, "change_24h": -3.2, "listings": 31},
    "swsh4-116": {"price": 980, "change_24h": 1.2, "listings": 45},
    "swsh12-215": {"price": 3420, "change_24h": 18.5, "listings": 8},
    "swsh3-76": {"price": 2650, "change_24h": 5.7, "listings": 18},
    "swsh2-239": {"price": 720, "change_24h": 3.4, "listings": 52},
    "swsh9-138": {"price": 1240, "change_24h": -0.8, "listings": 27},
    "base4-4": {"price": 128000, "change_24h": -2.3, "listings": 3},
}


def get_popular_card_list() -> list[dict]:
    """Returns list of dicts for batch scraping"""
    return [
        {
            "id": card_id,
            "name": name,
            "set": set_name,
        }
        for name, set_name, card_id in POPULAR_CARDS_HK
    ]
