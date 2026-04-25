export type RootStackParamList = {
  FeatureShowcase: undefined;
  Login: undefined;
  Register: undefined;
  Main: undefined;
  CardDetail: { cardId: string };
  Checkout: { cardId: string };
  OrderStatus: { txId: string };
  Notifications: undefined;
  MakeOffer: { listing?: any };
  MyOffers: undefined;
  OfferDetail: { offerId: string };
  ChatList: undefined;
  ChatDetail: { threadId: string; otherPartyId?: string; otherPartyName?: string };
};
