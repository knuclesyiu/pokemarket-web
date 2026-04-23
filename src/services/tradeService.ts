/**
 * PokeMarket — Trade Service（客戶端）
 * 封裝所有 Trade 相關的 Firebase Cloud Functions 呼叫
 */

import { httpsCallable } from 'firebase/functions';
import { getFunctions } from 'firebase/functions';
import type {
  MarketListing,
  UserCard,
  Offer,
  OfferStatus,
  OfferAction,
  TradeCard,
  GetMarketListingsResponse,
  CreateOfferResponse,
  RespondToOfferResponse,
  GetMyOffersResponse,
  ExecuteTradeResponse,
} from '../types/trade';

// ─── 通用呼叫器 ────────────────────────────────────────────────────────────────

async function callTrade<T>(fnName: string, data: object, timeout = 30000): Promise<T> {
  const fns = getFunctions();
  const fn = httpsCallable(fns, fnName, { timeout });
  const result = await fn(data);
  return result.data as T;
}

// ─── Market Listings ──────────────────────────────────────────────────────────

export interface MarketListingsParams {
  series?: string;
  rarity?: string;
  minPrice?: number;
  maxPrice?: number;
  condition?: string;
  type?: 'buy_now' | 'auction';
  limit?: number;
  offset?: number;
}

/** 取得市場掛牌列表（可過濾） */
export async function getMarketListings(params: MarketListingsParams = {}) {
  return callTrade<GetMarketListingsResponse>('getMarketListings', params);
}

// ─── User Cards ────────────────────────────────────────────────────────────────

/** 取得自己的收藏卡片（用於 MakeOffer 選擇） */
export async function getMyCards() {
  return callTrade<{ cards: UserCard[]; total: number }>('getUserCards', {});
}

// ─── Listings ───────────────────────────────────────────────────────────────────

/** 建立市場掛牌 */
export async function createListing(params: {
  card: TradeCard;
  price: number;
  type?: 'buy_now' | 'auction';
  condition?: string;
  auctionEnd?: number;
}) {
  return callTrade<{ listingId: string; status: string }>('createListing', params);
}

// ─── Offers ──────────────────────────────────────────────────────────────────────

/** 發出 Offer */
export async function createOffer(params: {
  listingId: string;
  offerCards: object[];
  cashAddHkd: number;
  message?: string;
}) {
  return callTrade<CreateOfferResponse>('createOffer', params);
}

/** 取得我的 Offer（sent / received） */
export async function getMyOffers(params: {
  type?: 'sent' | 'received' | 'all';
  status?: OfferStatus;
}) {
  return callTrade<GetMyOffersResponse>('getMyOffers', params);
}

/** 回覆 Offer（accept / reject / counter） */
export async function respondToOffer(params: {
  offerId: string;
  action: OfferAction;
  counterData?: {
    counterCards?: object[];
    counterCashHkd?: number;
    counterMessage?: string;
  };
}) {
  return callTrade<RespondToOfferResponse>('respondToOffer', params);
}

/** 取消 Offer（買家專用） */
export async function cancelOffer(offerId: string) {
  return callTrade<{ offerId: string; newStatus: OfferStatus }>('cancelOffer', { offerId });
}

// ─── Trade ─────────────────────────────────────────────────────────────────────

/** 直接執行卡片交換（不需要 Offer 審批） */
export async function executeTrade(params: {
  targetUserId: string;
  myCardIds: string[];
  theirCardIds: string[];
  cashToThemHkd?: number;
  message?: string;
}) {
  return callTrade<ExecuteTradeResponse>('executeTrade', params);
}
