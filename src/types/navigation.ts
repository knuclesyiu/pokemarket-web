import type { PokemonCard } from './index';
import type { MarketListing, Offer } from './trade';

export type RootStackParamList = {
  FeatureShowcase: undefined;
  Login: undefined;
  Register: undefined;
  Main: undefined;
  EditProfile: undefined;
  Sell: { cardId: string; cardName?: string; priceType?: 'fixed' | 'auction' } | undefined;
  CardDetail: { card: PokemonCard };
  Checkout: { card: PokemonCard; seller?: string };
  OrderStatus: { txId?: string; orderId?: string };
  Notifications: undefined;
  MakeOffer: { listing: MarketListing };
  MyOffers: undefined;
  OfferDetail: { offer: Offer; role: 'buyer' | 'seller' };
  ChatList: undefined;
  ChatDetail: { threadId: string; otherPartyId?: string; otherPartyName?: string };
  /** Set up a Stripe Connect account so the user can receive money. */
  SellerOnboarding: undefined;
  /** Move the seller's balance out to their bank. */
  Withdraw: undefined;
};
