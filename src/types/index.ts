// Pokemon Card Trading Platform — TypeScript Types

export interface PokemonCard {
  id: string;
  name: string;
  set: string;
  setCode: string;
  rarity: Rarity;
  grade?: number; // PSA/BGS grade
  price: number; // HKD
  priceChange24h: number; // percentage
  imageUrl: string;
  HoloV?: number;
  series: string;
  number: string;
  condition: CardCondition;
  language?: CardLanguage;  // 預設 English
  listed: boolean;
  listingCount: number;
}

export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Rare Holo' | 'Rare Ultra' | 'Rare Secret' | 'Promo';

export type CardLanguage = 'Japanese' | 'English' | 'Chinese' | 'Multilingual';

export type CardCondition = 'Mint' | 'Near Mint' | 'Excellent' | 'Good' | 'Fair' | 'Poor';

export interface PricePoint {
  date: string;
  price: number;
}

export interface Listing {
  id: string;
  cardId: string;
  sellerId: string;
  sellerName: string;
  price: number;
  type: 'buy_now' | 'auction';
  auctionEnd?: string;
  currentBid?: number;
  condition: CardCondition;
  grade?: number;
  listedAt: string;
}

export interface PortfolioItem {
  card: PokemonCard;
  quantity: number;
  avgBuyPrice: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
}

export interface MarketStats {
  totalVolume24h: number;
  topGainer: PokemonCard;
  topLoser: PokemonCard;
  trendingCards: PokemonCard[];
  newListings: PokemonCard[];
}
