/**
 * TODO: Cloud Function stubs for email verification flow.
 *
 * These functions are NOT yet deployed. When you wire them up:
 *
 * 1. Place this file (or convert to TypeScript) under your Cloud Functions
 *    directory, e.g. functions/src/auth/verification.ts
 *
 * 2. Deploy with: firebase deploy --only functions
 *
 * 3. The client will need to call these via httpsCallable from a new
 *    "sendVerificationEmail" and "checkEmailVerified" wrapper in
 *    authFlow.ts.
 *
 * 4. Add a "sendVerificationEmail" button to RegisterScreen after the
 *    email is saved — it shows the user a "check your inbox" message
 *    and they verify before being allowed to list / buy.
 *
 * Server-side enforced limits (server-side rules cannot be bypassed):
 *   - Listing creation blocked if email_verified == false
 *   - Checkout blocked if email_verified == false
 *   - Withdrawal blocked if email_verified == false
 *
 * 5. Update Firestore Security Rules:
 *
 *    match /orders/{orderId} {
 *      allow create: if request.auth != null
 *                     && request.auth.token.email_verified == true
 *                     && request.resource.data.buyerId == request.auth.uid;
 *      allow update: if request.auth.token.email_verified == true;
 *    }
 *
 *    match /listings/{listingId} {
 *      allow create: if request.auth.token.email_verified == true
 *                     && request.resource.data.sellerId == request.auth.uid;
 *    }
 */

/*
// ─── Pseudo-code (not deployed) ─────────────────────────────────────────────

import * as functions from 'firebase-functions';
import { sendEmailVerification, getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

export const sendVerificationEmail = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', '需要登入');
  }
  const user = await getAuth().getUser(context.auth.uid);
  if (user.emailVerified) {
    return { alreadyVerified: true };
  }
  // generateEmailVerificationLink returns a signed Firebase-hosted URL
  const link = await getAuth().generateEmailVerificationLink(user.email, {
    url: 'https://pokemarket.app/email-verified',
  });
  // TODO: send this link via SendGrid / Mailgun / your transactional
  // email provider. Firebase Admin SDK does NOT send the email for you.
  await sendVerificationEmailViaProvider(user.email, link);
  return { sent: true };
});

export const checkEmailVerified = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', '需要登入');
  }
  const user = await getAuth().getUser(context.auth.uid);
  if (user.emailVerified) {
    // Mark the user's Firestore profile so we can read it without an
    // admin round-trip from the client.
    await getFirestore().doc(`users/${context.auth.uid}`).set(
      { emailVerified: true, emailVerifiedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    return { verified: true };
  }
  return { verified: false };
});

// Optional: rate-limit PIN attempts server-side. After N fails, the
// Cloud Function refuses to verify until cooldown passes.
export const verifyPinServerSide = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '...');
  const { pin } = data;
  if (!pin) throw new functions.https.HttpsError('invalid-argument', '...');

  const attemptsRef = getFirestore()
    .collection('users').doc(context.auth.uid).collection('pinAttempts').doc('counter');
  const attemptsSnap = await attemptsRef.get();
  const attempts = attemptsSnap.exists ? attemptsSnap.data() : { count: 0, lastAt: 0 };

  const now = Date.now();
  if (attempts.count >= 5 && now - attempts.lastAt < 5 * 60 * 1000) {
    throw new functions.https.HttpsError('resource-exhausted',
      '交易密碼已鎖定 5 分鐘');
  }

  const userSnap = await getFirestore().doc(`users/${context.auth.uid}`).get();
  const hash = userSnap.data()?.transactionPinHash;
  if (!hash) throw new functions.https.HttpsError('not-found', '未設定 PIN');

  const ok = await verifyPinHash(pin, hash);
  if (!ok) {
    await attemptsRef.set({ count: attempts.count + 1, lastAt: now });
    throw new functions.https.HttpsError('permission-denied', 'PIN 不正確');
  }
  await attemptsRef.set({ count: 0, lastAt: now });
  return { verified: true };
});

*/
