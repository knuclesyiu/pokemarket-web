# PokeMarket — Resume Plan (2026-11-05)

## Goal
Users register their own account → then trade cards. Everything else is secondary.

## Audit findings (verified, not guessed)

### A. BLOCKER — registration does not create an account
`src/screens/auth/RegisterScreen.tsx`
- Collects email + password, then calls `updateProfile(...)` only.
  `updateProfile` writes to Firestore `users/{uid}` — it never calls
  `createUserWithEmailAndPassword`. So the password is collected, validated,
  and **thrown away**. The user ends up as an anonymous Firebase account.
- `authFlow.ts` already exports `upgradeAnonymousToEmail` (linkWithCredential)
  and `AuthContext` already exposes `upgradeFromAnonymous` — but RegisterScreen
  never calls it. ProfileScreen's "升級帳戶" button is the only path that does.

**Fix:** RegisterScreen must create the credential. Two cases:
1. Current user is anonymous → `upgradeFromAnonymous(email, password)`
   (keeps uid, keeps any portfolio data).
2. No user / already real → `createUserWithEmailAndPassword`.

Then `updateProfile` for displayName/phone.

### B. BLOCKER — navigation to a route that does not exist
`RegisterScreen.tsx:147` and `LoginScreen.tsx:50` call
`navigation.replace('MainTabs')`. There is no `MainTabs` route.
`App.tsx` registers the tab navigator as `Main` (`<Stack.Screen name="Main" component={HomeTabs}`).
→ `replace('MainTabs')` throws / silently does nothing. Login never lands on the app.

### C. BLOCKER — `EditProfile` route does not exist
`ProfileScreen.tsx:211` navigates to `'EditProfile'`. Not in `RootStackParamList`,
not registered in `App.tsx`.

### D. BLOCKER — `PortfolioTab` navigated from a stack screen
`OfferDetailScreen.tsx:140` calls `navigation.navigate('PortfolioTab')`.
`PortfolioTab` is a *tab* name inside `HomeTabs`, not a stack route.
From a stack screen this needs `navigation.navigate('Main', { screen: 'PortfolioTab' })`.

### E. 36 TypeScript errors in the app (build is broken)
`npx tsc --noEmit` → 36 errors. Breakdown:
- `src/utils/feeCalculator.ts` does not re-export `PLATFORM_FEE_PERCENT`,
  `STRIPE_PERCENT_FEE`, `STRIPE_FIXED_CENTS`, `ORDER_MIN_FEE_HKD`, but
  `CheckoutScreen.tsx:11` and `SellScreen.tsx:15` import them from there.
  → add `export { ... } from '../config/platform'`.
- `src/types/index.ts` has no `Card` export (`cardService.ts` imports it).
- `src/config/platform.ts` has no `TCGDEX_API` / `TCGDEX_LOCALE`.
- `src/components/search/SearchBar.tsx:45` — `onResults(null)` but prop is
  `(cards: PokemonCard[]) => void`. Prop type must allow `null`.
- `src/screens/CardDetailScreen.tsx` — missing `Alert` import; `styles.sourceTag`
  / `styles.sourceTagText` don't exist (they are `sourceBadge` / `sourceBadgeText`);
  `listing` inferred as `never` (empty array literal `[].map(...)`).
- `src/screens/SellScreen.tsx` — same `never` inference from `[].slice(0,4).map(...)`
  and `[].map(...)`; plus feeCalculator re-exports.
- `src/screens/CheckoutScreen.tsx:97` + `stripeService.ts:181` — `loadStripe()`
  called with 0 args, needs the publishable key.
- `src/screens/ProfileScreen.tsx:124` — `Alert.prompt` 4th arg is `AlertType`,
  but `'email-address'` is not in `AlertType` (it is `keyboardType`, arg 5).
- `src/services/cardService.ts` — entirely dead file (nothing imports it).
  Delete it rather than wire up `Card`/`TCGDEX_API`.

### F. 8 TypeScript errors in functions (build is broken)
`functions/`: `npx tsc --noEmit` → 8 errors.
- `functions/src/index.ts:23` exports `confirmPayment` but
  `escrow/confirmPayment.ts` only has `export {}` → stub. Remove the export
  (the client never calls `confirmPayment` as a callable).
- Stripe `apiVersion: '2024-12-18.acacia'` but installed stripe v17 expects
  `'2025-02-24.acacia'` → bump in createPaymentIntent / refundPayment /
  releasePayment / stripeWebhook.
- `noUnusedLocals` violations: `db` in sendVerificationEmail, `PLATFORM_FEE_PERCENT`
  in createPaymentIntent, `stripe` in releasePayment.

### G. Three Cloud Functions the client calls but that don't exist
Called by client, not exported by `functions/src/index.ts`:
- `getUserCards` → `tradeService.ts:53`, `MakeOfferScreen.tsx:89`
  (needed for the trade flow — the offerer's own cards).
- `createChatThread` → `CardDetailScreen.tsx:164`
- `getOrderStatus` → `stripeService.ts:222`
- (also `getNotifications`, `getUserReviews` — called from NotificationScreen /
  ProfileScreen; these read Firestore directly via rules, so a CF is optional,
  but the client calls them, so they must exist or the UI must change.)

### H. The trade flow doesn't actually trade
- `executeTrade.ts` writes a `trades` doc and says in a comment it does NOT move
  cards. `respondToOffer` on `accept` only flips `status` to `accepted` — it
  never moves the cards, never marks the listing sold, never creates a trade
  record. So "accept" is cosmetic.
- `createListing` stores `cardId`/`cardName`/`imageUrl` but the client's
  `MarketListing` type expects a nested `card: TradeCard` object, and
  `MakeOfferScreen` reads `listing.card.imageUrl` / `listing.card.set` /
  `listing.card.number`. → listing shape mismatch.
- `createListing` sets `sellerName: request.auth.token.name ?? ''` — Firebase
  tokens have no `name` claim for email/password users, so sellerName is always
  empty. → read displayName from `users/{uid}`.
- `getMarketListings` ignores `series`/`rarity` fields the client sends, and
  `getMyOffers` uses `orderBy(createdAt)` — but `createdAt` is written with
  `FieldValue.serverTimestamp()`, so it is a Timestamp, and the client types
  expect a `number`. → convert.

### I. Security — a buyer can self-accept their own offer
`firestore.rules`:
```
match /offers/{offerId} {
  allow update: if isSignedIn() && (
    resource.data.buyerId == request.auth.uid ||
    resource.data.sellerId == request.auth.uid);
}
```
The buyer can write `status: 'accepted'` on their own offer → then any code
path that trusts `status == 'accepted'` treats it as a completed trade.
Fix: clients must not write offer status at all. All status transitions go
through the Cloud Function (Admin SDK bypasses rules). Same for
`listings.status` (a seller could set `status:'sold'` unilaterally).

### J. Missing Firestore composite indexes
`getMyOffers` query = `where(field,'==',uid).orderBy('createdAt','desc')`.
The index file has `offers[buyerId,status,createdAt]` and
`offers[sellerId,status,createdAt]` — but the query without a `status` filter
needs `offers[buyerId,createdAt]` / `offers[sellerId,createdAt]`.
`getMarketListings` needs `listings[status,createdAt]` (present) but the
`minPrice/maxPrice` variants need `listings[status,price,createdAt]`.

## Environment state (verified)
- Firebase project `pokemarket-255c6` exists; **Email/Password auth is enabled**
  (confirmed: signUp against the real project returned HTTP 200 + localId).
- Web config fetched from the public `__/firebase/init.json` and written to
  `.env` (gitignored). Firebase web API keys are public client config, not secrets.
- **No `.env` existed** → `firebase.ts` had `process.env.EXPO_PUBLIC_*` undefined
  and `apiKey: proces...KEY` was literally corrupt source text (not a redaction —
  confirmed byte-for-byte with `od -c`). The app could not boot at all.
- **Cloud Functions are NOT deployed** — direct POST to
  `us-central1-pokemarket-255c6.cloudfunctions.net/getMarketListings` → 403.
- **Firestore rules not deployed** by us (they live in the repo only).
- JDK 21 installed at `~/.local/jdk` so the Firestore emulator can run.
- `firebase-tools` available via npx (v15.35.0). Not logged in — deployment
  needs an interactive Google login that the user must perform.
- GitHub token in `~/.config/gh/hosts.yml` is invalid (must re-auth; per prior
  security policy, treat as leaked → do not use, ask user to re-auth).
- Git: branch `flat-public`, 5 commits ahead of `origin/flat-public`, unpushed.

## Order of work
1. `.env` (done — .env written)
2. `firebase.ts` — fix corrupt `apiKey` line, add safe fallbacks
3. App TS errors → 0
4. Functions TS errors → 0
5. Missing CFs: getUserCards, createChatThread, getOrderStatus, getNotifications, getUserReviews
6. Registration flow (A) + navigation (B, C, D)
7. Trade flow real (H)
8. firestore.rules hardening (I) + indexes (J)
9. Verify: `expo export --platform web` clean, functions `tsc` clean, emulator
   smoke test of register → list → offer → accept → cards move.
