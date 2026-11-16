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

// Firestore refuses to store `undefined` and reports it as
// "Value for argument data is not a valid Firestore document". The
// write helpers here pass optional fields straight through —
// `grade` is undefined when a seller has not graded the card — and
// a single one of those turns into a hard failure. Listing a card
// without a grade used to fail for exactly this reason.
//
// Firestore only allows the setting to be changed before the first
// operation, and creating the client is not an operation, so this
// is still in time.
admin.firestore().settings({ ignoreUndefinedProperties: true });

export { createPaymentIntent } from './escrow/createPaymentIntent';
export { releasePayment } from './escrow/releasePayment';
export { refundPayment } from './escrow/refundPayment';

// Seller payouts. The app called these four and the source had lost
// them, so every call came back `not-found`.
export { createSellerAccount , setSellerPayoutDetails
, getSellerPayoutStatus
} from './escrow/sellerPayouts';
export { getSellerOnboardingStatus } from './escrow/sellerPayouts';
export { createWithdrawal } from './escrow/sellerPayouts';
export { confirmPayment } from './escrow/sellerPayouts';

export { extendEscrow } from './escrow/extendEscrow';
export { confirmReceipt } from './escrow/confirmReceipt';
export { markShipped } from './escrow/markShipped';
export { createDispute } from './escrow/createDispute';
export { sellerRespondToModification } from './escrow/sellerRespondToModification';

export { stripeWebhook } from './webhooks/stripeWebhook';

// Card catalogue. The prices in `card_prices` were written once by
// the Python scraper; these keep them moving.
export { syncCardPrices } from './prices/syncCardPrices';
export { scheduledCardPriceSync } from './prices/syncCardPrices';

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
