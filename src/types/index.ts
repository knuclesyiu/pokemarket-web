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

// ── Market Stats ──────────────────────────────────────────────────────────────

export interface MarketStats {
  totalVolume24h: number;
  totalVolume7d: number;
  activeListings: number;
  avgPrice: number;
  topGainer: PokemonCard;
  topLoser: PokemonCard;
  trendingCards: PokemonCard[];
  newListings: PokemonCard[];
}

// ── User ───────────────────────────────────────────────────────────────────────

export interface User {
  uid: string;
  displayName: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  rating: number;
  createdAt: string;
  listedCards: string[];
  portfolio: PortfolioItem[];
}

// ── Chat ───────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  imageUrl?: string;
  createdAt: string;
  read: boolean;
}

// ── Trade / Offers ─────────────────────────────────────────────────────────────

export interface Offer {
  id: string;
  buyerId: string;
  sellerId: string;
  cardId: string;
  offerPrice: number;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  createdAt: string;
}

// ── Reviews ────────────────────────────────────────────────────────────────────

export interface Review {
  id: string;
  reviewerId: string;
  revieweeId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string;
  createdAt: string;
}
