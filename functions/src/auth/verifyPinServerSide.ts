/**
 * Server-side PIN verification with rate limiting.
 * Client-side cooldown in AuthContext.verifyTransactionPin is a first line
 * of defense; this enforces hard limits.
 */
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { createHash } from 'crypto';

const db = admin.firestore();

// Must match client-side salt in AuthContext
const SALT = 'pokemarket_salt_v1';

function hashPin(pin: string): string {
  return createHash('sha256').update(pin + SALT).digest('hex');
}

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export const verifyPinServerSide = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', '需要登入');
  const uid = request.auth.uid;
  const { pin } = request.data as { pin: string };
  if (!pin || pin.length < 6) {
    throw new functions.HttpsError('invalid-argument', 'PIN 至少 6 位');
  }

  // Rate limit check
  const attemptsRef = db.doc(`users/${uid}/pinAttempts/counter`);
  const attemptsSnap = await attemptsRef.get();
  const attempts = attemptsSnap.exists ? attemptsSnap.data() as any : { count: 0, lockedUntil: 0 };
  const now = Date.now();
  if (attempts.lockedUntil && attempts.lockedUntil > now) {
    const wait = Math.ceil((attempts.lockedUntil - now) / 1000);
    throw new functions.HttpsError('resource-exhausted', `PIN 已鎖定，請等待 ${wait} 秒`);
  }

  // Verify
  const userSnap = await db.doc(`users/${uid}`).get();
  const storedHash = userSnap.data()?.transactionPinHash;
  if (!storedHash) {
    throw new functions.HttpsError('not-found', '未設定 PIN');
  }
  const ok = hashPin(pin) === storedHash;

  if (!ok) {
    const newCount = (attempts.count ?? 0) + 1;
    const update: any = { count: newCount, lastAt: now };
    if (newCount >= MAX_ATTEMPTS) {
      update.lockedUntil = now + LOCKOUT_DURATION_MS;
      update.count = 0;  // reset counter, use lockedUntil as gate
    }
    await attemptsRef.set(update, { merge: true });
    throw new functions.HttpsError('permission-denied', 'PIN 不正確');
  }

  // Success — reset counter
  await attemptsRef.set({ count: 0, lockedUntil: 0 }, { merge: true });
  return { verified: true };
});
