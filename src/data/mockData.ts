import { PokemonCard, PricePoint, Listing, PortfolioItem, MarketStats } from '../types';

// Mock card data — realistic Pokemon TCG HK market prices (HKD)
export const MOCK_CARDS: PokemonCard[] = [
  {
    id: 'swsh5-1',
    name: 'Charizard VMAX',
    set: 'Darkness Ablaze',
    setCode: 'DAA',
    rarity: 'Rare Ultra',
    series: 'Sword & Shield',
    number: '115/189',
    price: 4280,
    priceChange24h: +8.4,
    imageUrl: 'https://images.pokemontcg.io/swsh5/115.png',
    condition: 'Near Mint',
    listed: true,
    listingCount: 23,
  },
  {
    id: 'swsh12-1',
    name: 'Gengar VMAX',
    set: 'Evolving Skies',
    setCode: 'EVS',
    rarity: 'Rare Ultra',
    series: 'Sword & Shield',
    number: '71/203',
    price: 3150,
    priceChange24h: +12.1,
    imageUrl: 'https://images.pokemontcg.io/swsh12/71.png',
    condition: 'Mint',
    listed: true,
    listingCount: 14,
  },
  {
    id: 'base4-1',
    name: 'Charizard 1st Edition',
    set: 'Base Set',
    setCode: 'BS',
    rarity: 'Rare',
    series: 'Base',
    number: '4/102',
    price: 128000,
    priceChange24h: -2.3,
    imageUrl: 'https://images.pokemontcg.io/base4/4.png',
    condition: 'Excellent',
    listed: true,
    listingCount: 3,
  },
  {
    id: 'swsh3-1',
    name: 'Rayquaza VMAX',
    set: 'Champion\'s Path',
    setCode: 'CPA',
    rarity: 'Rare Ultra',
    series: 'Sword & Shield',
    number: '76/73',
    price: 2650,
    priceChange24h: +5.7,
    imageUrl: 'https://images.pokemontcg.io/swsh3/76.png',
    condition: 'Mint',
    listed: true,
    listingCount: 18,
  },
  {
    id: 'swsh8-1',
    name: 'Mewtwo VMAX',
    set: 'Vivid Voltage',
    setCode: 'VIV',
    rarity: 'Rare Ultra',
    series: 'Sword & Shield',
    number: '115/185',
    price: 1890,
    priceChange24h: -3.2,
    imageUrl: 'https://images.pokemontcg.io/swsh8/115.png',
    condition: 'Near Mint',
    listed: true,
    listingCount: 31,
  },
  {
    id: 'swsh4-1',
    name: 'Tyranitar VMAX',
    set: 'Battle Styles',
    setCode: 'BSS',
    rarity: 'Rare Ultra',
    series: 'Sword & Shield',
    number: '116/163',
    price: 980,
    priceChange24h: +1.2,
    imageUrl: 'https://images.pokemontcg.io/swsh4/116.png',
    condition: 'Near Mint',
    listed: true,
    listingCount: 45,
  },
  {
    id: 'swsh6-1',
    name: 'Umbreon VMAX',
    set: 'Evolving Skies',
    setCode: 'EVS',
    rarity: 'Rare Ultra',
    series: 'Sword & Shield',
    number: '215/203',
    price: 3420,
    priceChange24h: +18.5,
    imageUrl: 'https://images.pokemontcg.io/swsh12/215.png',
    condition: 'Mint',
    listed: true,
    listingCount: 8,
  },
  {
    id: 'dp6-1',
    name: 'Pikachu Illustrator',
    set: 'Promo',
    setCode: 'NP',
    rarity: 'Promo',
    series: 'Diamond & Pearl',
    number: 'POP Series 5',
    price: 2800000,
    priceChange24h: 0,
    imageUrl: 'https://images.pokemontcg.io/dpi/P5.png',
    condition: 'Good',
    listed: false,
    listingCount: 1,
  },
  {
    id: 'swsh9-1',
    name: 'Lugia VSTAR',
    set: 'Astral Radiance',
    setCode: 'ASR',
    rarity: 'Rare Ultra',
    series: 'Sword & Shield',
    number: '138/189',
    price: 1240,
    priceChange24h: -0.8,
    imageUrl: 'https://images.pokemontcg.io/swsh9/138.png',
    condition: 'Mint',
    listed: true,
    listingCount: 27,
  },
  {
    id: 'swsh2-1',
    name: 'Dragapult VMAX',
    set: 'Rebel Clash',
    setCode: 'RCL',
    rarity: 'Rare Ultra',
    series: 'Sword & Shield',
    number: '239/192',
    price: 720,
    priceChange24h: +3.4,
    imageUrl: 'https://images.pokemontcg.io/swsh2/239.png',
    condition: 'Near Mint',
    listed: true,
    listingCount: 52,
  },
];

// Generate price history for charts
export const generatePriceHistory = (basePrice: number, days = 30): PricePoint[] => {
  const points: PricePoint[] = [];
  let price = basePrice * 0.85;
  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const variance = (Math.random() - 0.4) * 0.08;
    price = Math.max(price * (1 + variance), basePrice * 0.5);
    points.push({
      date: date.toISOString().split('T')[0],
      price: Math.round(price),
    });
  }
  points[points.length - 1].price = basePrice;
  return points;
};

export const MOCK_LISTINGS: Listing[] = [
  {
    id: 'l1', cardId: 'swsh5-1', sellerId: 'u1', sellerName: 'CardMaster_HK',
    price: 4200, type: 'buy_now', condition: 'Near Mint',
    listedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: 'l2', cardId: 'swsh5-1', sellerId: 'u2', sellerName: 'PokemonCollector',
    price: 3800, type: 'buy_now', condition: 'Excellent',
    listedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
  {
    id: 'l3', cardId: 'swsh5-1', sellerId: 'u3', sellerName: 'RareCards_HK',
    price: 4500, type: 'auction', currentBid: 4100,
    auctionEnd: new Date(Date.now() + 86400000 * 1).toISOString(),
    condition: 'Mint',
    listedAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

export const MOCK_PORTFOLIO: PortfolioItem[] = [
  {
    card: MOCK_CARDS[0],
    quantity: 2,
    avgBuyPrice: 3800,
    currentValue: 8560,
    pnl: 960,
    pnlPercent: 12.6,
  },
  {
    card: MOCK_CARDS[1],
    quantity: 1,
    avgBuyPrice: 2800,
    currentValue: 3150,
    pnl: 350,
    pnlPercent: 12.5,
  },
  {
    card: MOCK_CARDS[3],
    quantity: 3,
    avgBuyPrice: 2200,
    currentValue: 7950,
    pnl: 1350,
    pnlPercent: 20.5,
  },
];

export const MOCK_STATS: MarketStats = {
  totalVolume24h: 2847650,
  topGainer: MOCK_CARDS[6], // Umbreon +18.5%
  topLoser: MOCK_CARDS[4], // Mewtwo -3.2%
  trendingCards: [MOCK_CARDS[0], MOCK_CARDS[1], MOCK_CARDS[6], MOCK_CARDS[3]],
  newListings: [MOCK_CARDS[2], MOCK_CARDS[7], MOCK_CARDS[8]],
};
