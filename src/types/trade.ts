/**
 * PokeMarket — Trade 功能型別定義
 * 卡片交換系統的所有型別
 */

// ─── 枚舉 ───────────────────────────────────────────────────────────────────

export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'countered';
export type ListingStatus = 'active' | 'sold' | 'cancelled' | 'expired';
export type ListingType = 'buy_now' | 'auction';
export type CardCondition = 'Mint' | 'Near Mint' | 'Excellent' | 'Good' | 'Fair' | 'Poor';
export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Rare Holo' | 'Rare Ultra' | 'Rare Secret' | 'Promo';
export type OfferAction = 'accept' | 'reject' | 'counter';

// ── Card grade (raw vs PSA/BGS slabbed) ───────────────────────────────────────
export type CardGrade =
  | 'raw'
  | 'psa10' | 'psa9' | 'psa8' | 'psa7'
  | 'bgs95' | 'bgs10' | 'bgs9' | 'cgc10' | 'other_graded';

export interface GradingInfo {
  grade: CardGrade;
  grader?: 'PSA' | 'BGS' | 'CGC' | 'Other';
  certNumber?: string;
  gradeValue?: number;
}

// ─── 卡片 ─────────────────────────────────────────────────────────────────────

export interface TradeCard {
  id: string;
  name: string;
  set: string;
  setCode: string;
  series: string;
  number: string;
  rarity: Rarity;
  grade?: number;        // PSA/BGS 等級 (legacy)
  grading?: GradingInfo; // 新結構化 slab 資料
  condition: CardCondition;
  imageUrl: string;
  marketPrice: number;   // HKD 市價參考
}

// ─── 掛牌 (Market Listing) ─────────────────────────────────────────────────────

export interface MarketListing {
  id: string;
  cardId: string;           // 關聯的卡 ID（可選，用於市場卡）
  card: TradeCard;           // 完整卡資料
  sellerId: string;
  sellerName: string;
  price: number;            // HKD（固定價）
  type: ListingType;
  auctionEnd?: number;       // Unix timestamp（競標結束時間）
  condition: CardCondition;
  grade?: number;             // legacy
  grading?: GradingInfo;      // new — raw vs PSA/BGS slab
  status: ListingStatus;
  createdAt: number;        // Unix timestamp
}

// ─── Offer（報價提議）─────────────────────────────────────────────────────────

export interface OfferCard {
  card: TradeCard;
  condition: CardCondition;
  grade?: number;
  note?: string;
}

export interface Offer {
  id: string;
  listingId: string;
  // 目標卡（賣家的掛牌卡）
  targetCard: TradeCard;
  targetPrice: number;      // 掛牌價 HKD
  // 買家主動發出的 Offer
  buyerId: string;
  buyerName: string;
  offerCards: OfferCard[];   // 買家拿出來交換的卡
  cashAddHkd: number;        // 現金補貼（HKD）
  message?: string;
  status: OfferStatus;
  // 還價 counter offer（賣家還的回覆）
  counterOffer?: {
    counterCards: OfferCard[];
    counterCashHkd: number;
    counterMessage?: string;
    respondedAt: number;
  };
  createdAt: number;
  respondedAt?: number;
}

// ─── 用戶卡片 collection ───────────────────────────────────────────────────────

export interface UserCard {
  id: string;                // 文件 ID
  cardId: string;            // 市場卡 ID（可選）
  card: TradeCard;
  acquiredAt: number;         // Unix timestamp
  source: 'purchase' | 'trade' | 'listing' | 'other';
  condition: CardCondition;
  grade?: number;             // legacy
  grading?: GradingInfo;      // new
  notes?: string;
}

// ─── 交易歷史 ───────────────────────────────────────────────────────────────────

export interface TradeRecord {
  id: string;
  // 雙方
  partyAId: string;
  partyAName: string;
  partyBId: string;
  partyBName: string;
  // 交換內容
  partyACards: OfferCard[];    // A 給出的卡
  partyBCards: OfferCard[];    // B 給出的卡
  cashAtoBHkd: number;        // A 給 B 現金
  cashBtoAHkd: number;        // B 給 A 現金
  // 狀態
  tradeType: 'direct_trade' | 'offer_accepted';
  offerId?: string;
  listingId?: string;
  completedAt: number;
  createdAt: number;
}

// ─── API 回應型別 ─────────────────────────────────────────────────────────────

export interface GetMarketListingsResponse {
  listings: MarketListing[];
  total: number;
}

export interface CreateOfferResponse {
  offerId: string;
  status: 'pending';
}

export interface RespondToOfferResponse {
  offerId: string;
  newStatus: OfferStatus;
  tradeId?: string;   // 雙方都 accept 後產生的 tradeId
}

export interface GetMyOffersResponse {
  offers: Offer[];
  total: number;
}

export interface ExecuteTradeResponse {
  tradeId: string;
  status: 'completed';
}
