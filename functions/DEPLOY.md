# PokeMarket — Cloud Functions Deploy Guide

## Overview

The app client (`src/services/stripeService.ts`, etc.) calls these
Firebase Cloud Functions over HTTPS. Until they're deployed, any
flow that goes through them (escrow, dispute, etc.) will fail at
runtime with `functions/v2/https` not-found errors.

## 1. Install Firebase CLI

```bash
# If you don't have it yet (you do — confirmed at /mnt/c/Users/user/AppData/Roaming/npm/firebase)
npm install -g firebase-tools
firebase login
```

## 2. Initialize Functions (one-time)

```bash
cd /home/user/Documents/Development/PokeMarket/functions
npm install
# This will install firebase-functions, firebase-admin, stripe
```

Expected: `node_modules/` populated, ~120 MB.

## 3. Configure Stripe Secrets

The functions need your Stripe **secret** key (not the publishable one
that's already in `.env`). Server-side keys never go to the client.

```bash
# Set as Firebase secrets (encrypted at rest)
firebase functions:secrets:set STRIPE_SECRET_KEY
# Paste sk_test_xxxxxxxx when prompted

firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
# Paste whsec_xxxxxxxx (from Stripe Dashboard → Webhooks → endpoint → Signing secret)
```

For production, set them as `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` 
without the `:` prefix and they'll be accessible as `process.env.STRIPE_SECRET_KEY`.

## 4. Configure Stripe Webhook Endpoint

In Stripe Dashboard:
1. Developers → Webhooks → **Add endpoint**
2. URL: `https://us-central1-pokemarket-255c6.cloudfunctions.net/stripeWebhook`
3. API version: `2024-12-18.acacia` (or whatever the current version is)
4. Events to send:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
   - `transfer.created`
5. Click "Add endpoint" → copy the **Signing secret** (starts with `whsec_`)
6. Use that value in step 3 (`STRIPE_WEBHOOK_SECRET`)

## 5. Deploy Functions

```bash
cd /home/user/Documents/Development/PokeMarket
firebase deploy --only functions
```

Expected: 21 functions deployed (escrow 9, webhooks 1, listings 8, auth 3).

## 6. Verify Deployment

```bash
# List deployed functions
firebase functions:list

# Tail logs to see if they're healthy
firebase functions:log
```

Test a function via Firebase Console:
- Functions → `createPaymentIntent` → Test with:
  ```json
  {
    "data": {
      "amountHkd": 100,
      "sellerId": "<some-real-uid-with-stripe-onboarding>",
      "deliveryMethod": "meetup",
      "cardName": "Test Card",
      "cardId": "base1-4"
    }
  }
  ```
  Should return `{ orderId, clientSecret, paymentIntentId, ... }` if everything's wired right.

## 7. Enable Email/Password Auth in Firebase Console

In `https://console.firebase.google.com/project/pokemarket-255c6/authentication/providers`:
- Enable **Email/Password** (for the LoginScreen)
- Enable **Anonymous** (for the auto-anon-on-launch)
- Enable **Phone** (optional — the app gracefully handles if it's off)

## 8. Deploy Firestore Rules

Critical for security. See `../firestore.rules`. Deploy with:

```bash
cd /home/user/Documents/Development/PokeMarket
firebase deploy --only firestore:rules
```

OR paste the contents into Firebase Console → Firestore → Rules tab → Publish.

## 9. Set up Service Account (for Admin SDK)

The functions need a service account to write to Firestore with
admin privileges. By default, Cloud Functions use the project's
default service account which already has Firestore admin access.
No action needed.

For local emulator development:
```bash
export GOOGLE_APPLICATION_CREDENTIALS="/home/user/.openclaw/workspace/pokemarket-sa.json"
firebase emulators:start --only functions,firestore
```

## Function Inventory (21 total)

### Escrow (9)
- `createPaymentIntent` — Buyer taps "Confirm Payment", funds get held in platform
- `confirmPayment` — (unused; client confirms via SDK)
- `releasePayment` — Buyer confirms receipt, funds release to seller
- `refundPayment` — Admin-triggered refund
- `extendEscrow` — Buyer extends auto-release deadline by 14 days
- `confirmReceipt` — Buyer marks card as received
- `createDispute` — Buyer raises a dispute
- `sellerRespondToModification` — Seller accepts/rejects modified amount
- Stripe webhook: `stripeWebhook` — Receives Stripe events, updates order state

### Listings (8)
- `createListing` — Seller creates a new listing
- `searchCardsWithPrices` — Search by name
- `getCardPrice` — Single card price snapshot
- `getMarketListings` — Public catalog
- `createOffer` — Buyer makes a trade offer
- `respondToOffer` — Seller accept/reject/counter
- `cancelOffer` — Buyer cancels pending offer
- `getMyOffers` — List user's offers
- `executeTrade` — Direct card swap (no escrow)

### Auth (3)
- `sendVerificationEmail` — Sends email verification link
- `checkEmailVerified` — Mirrors verification state to Firestore
- `verifyPinServerSide` — Server-side PIN rate limiting

## Cost Estimate (Blaze plan)

- **Cloud Function invocations**: free tier = 2M/month, then $0.40/M
- **Cloud Function compute**: free tier = 400k GB-sec/month
- **Outbound networking** (Stripe API): free tier = 5GB/month
- **Firestore reads/writes**: free tier = 50k reads, 20k writes/day

For an MVP with ~1000 MAU and ~50 trades/day, expect:
- ~50 createPaymentIntent/day = 50 calls
- ~50 releasePayment/day = 50 calls
- ~150 Stripe webhook events/day
- ~1000 searchCardsWithPrices/day

Total: ~$0-5/month for low traffic, well within free tier.

## Production Hardening TODO

The current `firestore.rules` is permissive enough for MVP but
should be tightened before public launch:

1. Uncomment `isEmailVerified()` check in createListing/createOrder
2. Add admin claim requirement for refundPayment
3. Set up App Check to prevent quota abuse
4. Set up budget alerts in Google Cloud Console
5. Switch to destination charges with on_behalf_of for tax compliance
6. Implement idempotency keys for Stripe API calls

## Rollback

If a function breaks in production:
```bash
# Roll back a single function
firebase functions:delete createPaymentIntent

# Or roll back everything
firebase functions:list  # get version
# Then redeploy a known-good commit
git checkout <good-commit>
cd functions && npm run build
cd .. && firebase deploy --only functions
```
