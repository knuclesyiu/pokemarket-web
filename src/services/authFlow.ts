/**
 * PokeMarket — Auth Flow Helpers
 *
 * Higher-level auth operations that combine Firebase Auth primitives
 * into the user flows the screens actually need.
 *
 * Key flows:
 *   - email sign-in (no auto-create)         signInEmailOrPromptSignup()
 *   - anonymous → credential upgrade        upgradeAnonymousToCredential()
 *   - session refresh                        refreshSession()
 *   - clean sign-out (reset nav stack)      signOutAndReset()
 */

import {
  Auth,
  User,
  UserCredential,
  AuthError,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  linkWithCredential,
  EmailAuthProvider,
  signOut as fbSignOut,
  getIdToken,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';

/**
 * Try to sign in with email + password.
 * On `auth/user-not-found` or `auth/invalid-credential`:
 *   - returns { kind: 'needs_signup' } instead of auto-creating.
 * The caller (LoginScreen) is expected to navigate to RegisterScreen.
 *
 * This prevents the previous "user typos password → we silently create a
 * new account" bug.
 */
export type EmailSignInResult =
  | { kind: 'ok'; user: User }
  | { kind: 'needs_signup' }
  | { kind: 'error'; code: string; message: string };

export async function signInEmailOrPromptSignup(
  auth: Auth,
  email: string,
  password: string,
): Promise<EmailSignInResult> {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return { kind: 'ok', user: cred.user };
  } catch (e) {
    const code = (e as FirebaseError)?.code ?? '';
    if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
      return { kind: 'needs_signup' };
    }
    return {
      kind: 'error',
      code,
      message: (e as Error)?.message ?? '登入失敗',
    };
  }
}

/**
 * Sign out, then notify the caller to navigate to Login.
 * The caller is expected to do navigation.reset() to clear the stack.
 */
export async function signOutAndReset(auth: Auth): Promise<void> {
  await fbSignOut(auth);
}

/**
 * Upgrade an anonymous account to a permanent credential.
 * On success the previous `currentUser` (anonymous) becomes the same
 * uid but with a real provider — all Firestore data stays attached.
 *
 * Returns { kind: 'ok' | 'error' } — caller is expected to navigate to
 * RegisterScreen if upgrading from anonymous.
 */
export type UpgradeResult =
  | { kind: 'ok'; user: User }
  | { kind: 'error'; code: string; message: string };

export async function upgradeAnonymousToEmail(
  currentUser: User,
  email: string,
  password: string,
): Promise<UpgradeResult> {
  if (!currentUser.isAnonymous) {
    return { kind: 'error', code: 'not-anonymous', message: '帳戶已升級，請直接登入' };
  }
  const cred = EmailAuthProvider.credential(email, password);
  try {
    const result = await linkWithCredential(currentUser, cred);
    return { kind: 'ok', user: result.user };
  } catch (e) {
    return {
      kind: 'error',
      code: (e as FirebaseError)?.code ?? '',
      message: (e as Error)?.message ?? '升級失敗',
    };
  }
}

/**
 * Force-refresh the user's ID token (e.g. on app resume).
 * Returns the fresh token, or null on error.
 */
export async function refreshSession(auth: Auth): Promise<string | null> {
  const u = auth.currentUser;
  if (!u) return null;
  try {
    return await getIdToken(u, /* forceRefresh */ true);
  } catch {
    return null;
  }
}

/**
 * Check if a Firebase error is a "phone provider not enabled" error.
 * Surfacing this clearly helps the user know the app needs admin setup
 * rather than thinking they did something wrong.
 */
export function isPhoneProviderDisabled(e: unknown): boolean {
  const code = (e as FirebaseError)?.code ?? '';
  return (
    code === 'auth/operation-not-allowed' ||
    code === 'auth/missing-phone-number' ||
    code === 'auth/invalid-phone-number'
  );
}
