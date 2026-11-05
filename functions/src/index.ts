/**
 * PokeMarket — Cloud Functions Entry Point
 *
 * Deploy:  firebase deploy --only functions
 * Logs:    firebase functions:log
 * Emulate: firebase emulators:start --only functions
 *
 * Env vars required (set via `firebase functions:secrets:set`):
 *   - STRIPE_SECRET_KEY       (sk_live_... or sk_test_...)
 *   - STRIPE_WEBHOOK_SECRET    (whsec_... from Stripe dashboard)
 *
 * Or for local dev: functions/.env.local with the same keys.
 */

import * as admin from 'firebase-admin';

// Initialize Admin SDK exactly once
if (!admin.apps.length) {
  admin.initializeApp();
}

export { createPaymentIntent } from './escrow/createPaymentIntent';
export { releasePayment } from './escrow/releasePayment';
export { refundPayment } from './escrow/refundPayment';

export { extendEscrow } from './escrow/extendEscrow';
export { confirmReceipt } from './escrow/confirmReceipt';
export { createDispute } from './escrow/createDispute';
export { sellerRespondToModification } from './escrow/sellerRespondToModification';

export { stripeWebhook } from './webhooks/stripeWebhook';

export { createListing } from './listings/createListing';
export { searchCardsWithPrices } from './listings/searchCardsWithPrices';
export { getCardPrice } from './listings/getCardPrice';
export { getMarketListings } from './listings/getMarketListings';
export { createOffer } from './listings/createOffer';
export { respondToOffer } from './listings/respondToOffer';
export { cancelOffer } from './listings/cancelOffer';
export { getMyOffers } from './listings/getMyOffers';
export { getUserCards } from './listings/getUserCards';
export { executeTrade } from './listings/executeTrade';

export { createChatThread } from './chat/createChatThread';
export { getOrderStatus } from './orders/getOrderStatus';
export { getNotifications } from './notifications/getNotifications';
export { getUserReviews } from './reviews/getUserReviews';

export { sendVerificationEmail } from './auth/sendVerificationEmail';
export { checkEmailVerified } from './auth/checkEmailVerified';
export { verifyPinServerSide } from './auth/verifyPinServerSide';
