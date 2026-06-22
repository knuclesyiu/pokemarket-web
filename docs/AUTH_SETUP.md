# Auth Hardening — Firebase Console Setup Checklist

After running the new client code, you need to enable some providers
in Firebase Authentication. This is a one-time manual step.

## 1. Enable Email/Password

1. Open https://console.firebase.google.com/project/pokemarket-255c6/authentication/providers
2. Click "Email/Password" → Enable → Save
3. (Optional) Toggle "Email link (passwordless sign-in)" — leave OFF for now

## 2. Enable Phone (Optional but recommended)

1. Click "Phone" → Enable
2. For web testing: add your domain to "Authorized domains" at the bottom
   (e.g. `localhost`, your-staging-domain.com)
3. For native apps: requires reCAPTCHA verification
   - For now, the app gracefully shows a "phone login not enabled, use email"
     message on the Login screen if you haven't done this

## 3. Enable Anonymous (already done by default)

1. Should already be enabled — verify
2. This is what lets AuthProvider auto-sign-in users on first visit

## 4. Email Verification Template (for Phase 3)

1. Click "Templates" tab
2. "Email address verification" → edit the subject and message
3. Action URL should be your app's deep link (e.g. `https://pokemarket.app/email-verified`)

## 5. Firestore Security Rules (CRITICAL — pre-launch)

The auth flow is meaningless without server-side enforcement. Without
proper rules, any user can read/write any other user's data.

Replace your Firestore Rules with these (you'll need to adapt for your
exact schema):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper: user must be signed in
    function isSignedIn() {
      return request.auth != null;
    }

    // Helper: this is the signed-in user's own data
    function isOwner(userId) {
      return isSignedIn() && request.auth.uid == userId;
    }

    // Card prices: world-readable (public catalog)
    match /card_prices/{cardId} {
      allow read: if true;
      allow write: if false; // server-only via Admin SDK
    }

    // User profiles: public read, owner write
    match /users/{userId} {
      allow read: if isSignedIn();
      allow create, update: if isOwner(userId);
      allow delete: if false;

      // Wallet subcollection
      match /wallet/{doc} {
        allow read, write: if isOwner(userId);
      }
      match /portfolio/{cardId} {
        allow read, write: if isOwner(userId);
      }
    }

    // Orders: only buyer + seller can read; only buyer can create
    match /orders/{orderId} {
      allow read: if isSignedIn() && (
        resource.data.buyerId == request.auth.uid ||
        resource.data.sellerId == request.auth.uid
      );
      allow create: if isSignedIn()
        && request.resource.data.buyerId == request.auth.uid
        && request.resource.data.amountHkd > 0;
      allow update: if false; // server-only via Cloud Functions
    }

    // Listings: anyone can read; only owner can create/update/delete
    match /listings/{listingId} {
      allow read: if true;
      allow create: if isSignedIn()
        && request.resource.data.sellerId == request.auth.uid;
      allow update, delete: if isSignedIn()
        && resource.data.sellerId == request.auth.uid;
    }

    // Conversations: only participants
    match /conversations/{threadId} {
      allow read, write: if isSignedIn()
        && request.auth.uid in resource.data.participantIds;
    }
  }
}
```

## 6. Authorized Domains

In Firebase Console → Authentication → Settings → Authorized domains:
- `localhost` (already there)
- `pokemarket-255c6.firebaseapp.com` (already there)
- Your production domain (when you deploy)

## 7. App Verification (Native Phone Auth)

For native iOS / Android phone auth, you need:
- iOS: APNs key in Project Settings → Cloud Messaging
- Android: SHA-256 fingerprint in Project Settings → General

For web: reCAPTCHA is auto-handled by the `firebase/auth` SDK.

## Reference

- Firebase Auth docs: https://firebase.google.com/docs/auth
- Auth Context reference: `src/contexts/AuthContext.tsx`
- Cloud Function stubs (not yet deployed): `src/services/authCloudFunctionStubs.ts`
