# PokeMarket Firebase + Stripe Setup Guide

## Overview

```
React Native App
      ↓  httpsCallable (FCM)
Firebase Cloud Functions
      ↓  Stripe SDK
Stripe
  ├─ PaymentIntent (escrow)
  ├─ Transfer (to seller)
  └─ Payout (to seller's bank)
      ↓
Firestore (order state)
```

---

## Step 1: Firebase Console Setup

### 1.1 Create Firebase Project
```
1. Go to https://console.firebase.google.com
2. Click "Add project" → Name: "pokemarket"
3. Enable Google Analytics (optional)
4. Create project
```

### 1.2 Enable Firestore
```
Firebase Console → Build → Firestore Database
→ Create database → Start in production mode
Choose a region: asia-east1 (Hong Kong)
```

### 1.3 Enable Firebase Functions
```
Firebase Console → Build → Functions
→ Get started → Upgrade to Blaze plan (pay-as-you-go)
(Functions have a FREE tier: 125K invocations/month)
```

### 1.4 Enable Authentication
```
Firebase Console → Build → Authentication
→ Get started → Enable "Email/Password" and "Google"
```

---

## Step 2: Add Firebase to React Native App

```bash
cd PokeTrader
npx expo install firebase
npx expo install @stripe/stripe-react-native
```

### App.tsx — Initialize Firebase
```typescript
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_WEB_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "...",
  appId: "...",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "asia-east1"); // HK region
```

---

## Step 3: Deploy Firebase Functions

### 3.1 Install Firebase CLI
```bash
npm install -g firebase-tools
firebase login
```

### 3.2 Initialize Firebase in project
```bash
cd PokeTrader
firebase init functions
# Select: TypeScript, ESLint, npm install
# Project: select your PokeMarket project
```

### 3.3 Configure .env (NEVER commit this)
```bash
# firebase/.env
STRIPE_SECRET_KEY=sk_test_...   # Use TEST keys for development
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 3.4 Deploy Functions
```bash
cd PokeTrader
firebase deploy --only functions
```

### 3.5 Get Function URL
```
Firebase Console → Functions → your function
Copy the trigger URL:
https://us-central1-YOUR_PROJECT.cloudfunctions.net/createPaymentIntent
```

---

## Step 4: Stripe Dashboard Setup

### 4.1 Get API Keys
```
Stripe Dashboard → Developers → API keys
- Publishable key: pk_test_... (SAFE for frontend)
- Secret key: sk_test_... (SAFE for backend ONLY)
```

### 4.2 Enable Stripe Connect
```
Stripe Dashboard → Settings → Connect → Enable
Account type: Express (marketplace)
```

### 4.3 Set Platform Fee
```
Stripe Dashboard → Settings → Connect → Platform settings
Fee: 3% per transaction
```

### 4.4 Add Webhook
```
Stripe Dashboard → Developers → Webhooks → Add endpoint

URL: https://us-central1-YOUR_PROJECT.cloudfunctions.net/stripeWebhook

Events to listen:
✓ payment_intent.succeeded
✓ payment_intent.payment_failed
✓ charge.refunded
✓ payout.paid

→ Copy the webhook signing secret (whsec_...)
```

### 4.5 Save secrets to Firebase
```bash
firebase functions:config:set stripe.secret_key="sk_test_..."
firebase functions:config:set stripe.webhook_secret="whsec_..."
firebase deploy --only functions
```

---

## Step 5: React Native — Checkout Integration

### CheckoutScreen.tsx (simplified)
```typescript
import { createEscrowPayment, confirmPayment } from '@/services/stripeService';

async function handlePay() {
  // 1. Create PaymentIntent (escrow hold)
  const { clientSecret } = await createEscrowPayment({
    orderId: 'order_123',
    amountHkd: 4200,
    sellerId: 'seller_456',
    deliveryMethod: 'meetup',
    cardName: 'Charizard VMAX',
    cardId: 'swsh5-115',
  });

  // 2. For FPS: buyer transfers manually, then confirm
  // For Card: use Stripe SDK
  await confirmPayment({ paymentIntentId });

  // 3. Navigate to OrderStatus
  navigation.navigate('OrderStatus', { orderId: 'order_123' });
}
```

---

## Step 6: Seller Onboarding (First Time Seller)

```typescript
import { startSellerOnboarding, checkSellerOnboarding } from '@/services/stripeService';

async function handleStartSelling() {
  // Check if already onboarded
  const { onboarded, onboardingUrl } = await checkSellerOnboarding();

  if (!onboarded && onboardingUrl) {
    // Redirect to Stripe's hosted onboarding page
    await WebBrowser.openBrowserAsync(onboardingUrl);
    // After returning, check again
    const { onboarded: nowOnboarded } = await checkSellerOnboarding();
    if (nowOnboarded) {
      // Enable selling features
    }
  }
}
```

---

## Step 7: Verify with Test Cards

### Stripe Test Mode Cards
```
Success:     4242 4242 4242 4242 | Any future date | Any CVC
Auth only:   4000 0025 0000 3155
Fail:        4100 0000 0000 0019
FPS Success: 1111 1111 1111 1111 (if using Stripe FX)
```

### Test Flow (Test Mode)
1. Use `sk_test_...` keys in Firebase Functions
2. Use `pk_test_...` in RN app
3. All money is MOCK — no real charges
4. Verify:
   - PaymentIntent created ✓
   - Funds captured ✓
   - Funds transferred to seller ✓
   - Seller payout arrived ✓

---

## Step 8: Go Live Checklist

- [ ] Switch to live Stripe keys (`pk_live_...`, `sk_live_...`)
- [ ] Verify Stripe Connect compliance (identity verification)
- [ ] Add Stripe Radar fraud rules
- [ ] Set up Stripe dispute handling email
- [ ] Enable 2FA on Stripe account
- [ ] Test with real $1 transaction
- [ ] Remove all test cards from test data

---

## Cost Estimate (Production)

| Item | Free Tier | Notes |
|------|-----------|-------|
| Firebase Functions | 125K calls/mo | ~$0 at startup |
| Firestore | 1GB storage, 50K reads/day | ~$0 at startup |
| Stripe Platform Fee | 3% per transaction | You keep, Stripe takes cut |
| Stripe Connect | Free to set up | Standard processing fees apply |

**For a hobby/side project: essentially FREE until you hit real volume.**
