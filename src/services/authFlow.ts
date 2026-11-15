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
 * Create a brand-new email/password account.
 *
 * Used when the visitor is NOT signed in as an anonymous user — e.g. the
 * account was deleted, or the anon session was cleared. When the current
 * user IS anonymous we prefer `upgradeAnonymousToEmail` so that any data
 * already created under the anonymous uid (portfolio, drafts) survives.
 *
 * `auth/email-already-in-use` is surfaced as a distinct code so the UI can
 * tell the user "this email is taken, try logging in" instead of a raw
 * Firebase message.
 */
export type RegisterResult =
  | { kind: 'ok'; user: User }
  | { kind: 'error'; code: string; message: string };

export async function registerWithEmail(
  auth: Auth,
  email: string,
  password: string,
): Promise<RegisterResult> {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    return { kind: 'ok', user: cred.user };
  } catch (e) {
    const code = (e as FirebaseError)?.code ?? '';
    let message = (e as Error)?.message ?? '註冊失敗';
    if (code === 'auth/email-already-in-use') {
      message = '呢個 Email 已經註冊咗，請直接登入';
    } else if (code === 'auth/weak-password') {
      message = '密碼太弱，請用至少 6 個字元';
    } else if (code === 'auth/invalid-email') {
      message = 'Email 格式唔啱';
    } else if (code === 'auth/operation-not-allowed') {
      message = '此 App 尚未啟用 Email 註冊，請聯絡管理員';
    }
    return { kind: 'error', code, message };
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
    // Not a forced refresh. The SDK refreshes an expired token on its
    // own, and forcing one on every cold start signs the user out
    // silently whenever the refresh token has been revoked — the
    // failure arrives as a rejected promise, the SDK signs the user
    // out, and the app carries on as a guest with nothing to show
    // for it.
    return await getIdToken(u);
  } catch (e: any) {
    console.warn(
      '[auth] could not read the session token:',
      (e as { code?: string })?.code ?? (e as Error)?.message ?? e,
    );
    return null;
  }
}

/**
 * Check if a Firebase error is a "phone provider not enabled" error.
 * Surfacing this clearly helps the user know the app needs admin setup
 * rather than thinking they did something wrong.
 */
/**
 * Whether this browser is a phone or tablet.
 *
 * Google sign-in goes through a popup on a desktop browser, but most
 * mobile browsers block popups outright — the window opens and is then
 * dismissed, and the sign-in never completes. A redirect works
 * everywhere, so the mobile path takes it.
 *
 * iPadOS reports itself as a Mac, so the touch points are the tell.
 */
export function isMobileBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iPadOS =
    /Macintosh/.test(ua) &&
    typeof navigator.maxTouchPoints === 'number' &&
    navigator.maxTouchPoints > 1;
  return (
    /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua) ||
    iPadOS
  );
}

export function isPhoneProviderDisabled(e: unknown): boolean {
  const code = (e as FirebaseError)?.code ?? '';
  return (
    code === 'auth/operation-not-allowed' ||
    code === 'auth/missing-phone-number' ||
    code === 'auth/invalid-phone-number'
  );
}
