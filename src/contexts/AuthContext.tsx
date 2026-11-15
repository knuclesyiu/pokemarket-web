/**
 * AuthContext — manages Firebase Auth state + user profile from Firestore
 *
 * v2 changes (Phase C auth hardening):
 *   - Removed window.recaptchaVerifier (RN path)
 *   - Stopped auto-anon re-fire loop (anonSignInInFlight ref)
 *   - Email sign-in no longer auto-creates — caller handles 'needs_signup'
 *   - Google sign-in throws clean error on RN
 *   - Added refreshSession() — force-refresh ID token
 *   - Added upgradeAnonymousToEmail() — link credential to anon user
 *   - signOut() takes optional navigator callback for stack reset
 *   - Profile auto-create path is wrapped in try/catch
 *   - onAuthStateChanged uses ref-guard against re-entrancy
 */
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  User, ConfirmationResult, browserLocalPersistence, inMemoryPersistence, setPersistence,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { setActiveTheme } from '../theme';
import { rememberReturnPath } from '../services/returnPath';
import { UserProfile } from '../types/user';
import {
  signInEmailOrPromptSignup, EmailSignInResult,
  upgradeAnonymousToEmail, UpgradeResult,
  registerWithEmail as registerWithEmailImpl, RegisterResult,
  refreshSession as refreshSessionImpl,
  isPhoneProviderDisabled,
  isMobileBrowser,
} from '../services/authFlow';

interface AuthContextValue {
  currentUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isAnonymous: boolean;
  signInWithPhone: (phone: string) => Promise<ConfirmationResult>;
  signInWithEmail: (email: string, password: string) => Promise<EmailSignInResult>;
  signInWithGoogle: () => Promise<User | null>;
  signInAnonymously: () => Promise<User>;
  upgradeFromAnonymous: (email: string, password: string) => Promise<UpgradeResult>;
  registerWithEmail: (email: string, password: string) => Promise<RegisterResult>;
  signOut: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
  setTransactionPin: (pin: string) => Promise<void>;
  verifyTransactionPin: (pin: string) => Promise<boolean>;
  refreshSession: () => Promise<string | null>;
  isPhoneProviderDisabled: (e: unknown) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  return useContext(AuthContext)!;
}

/**
 * Verify a transaction PIN. Includes a client-side cooldown:
 * - 1 second between attempts
 * - 3 failed attempts in 60 seconds triggers a 30-second lockout
 *
 * NOTE: this is client-side defense only. A determined attacker can
 * bypass by clearing app data. For production, pair with a Cloud
 * Function that tallies attempts per user in Firestore and enforces
 * server-side rate limits.
 */
const PIN_MIN_INTERVAL_MS = 1000;
const PIN_FAILED_WINDOW_MS = 60_000;
const PIN_LOCKOUT_THRESHOLD = 3;
const PIN_LOCKOUT_DURATION_MS = 30_000;

const pinVerifyState: { lastAttempt: number; failedTimestamps: number[]; lockedUntil: number } = {
  lastAttempt: 0,
  failedTimestamps: [],
  lockedUntil: 0,
};

export function getPinLockoutRemainingMs(): number {
  return Math.max(0, pinVerifyState.lockedUntil - Date.now());
}

export function isPinVerifyLocked(): boolean {
  return getPinLockoutRemainingMs() > 0;
}

async function hashPin(pin: string): Promise<string> {
  // SHA-256 with app salt. NOT enough for high-value keys (use a KDF
  // + per-user salt for production) but adequate for transaction PIN
  // gating. Adequate against casual brute force.
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + 'pokemarket_salt_v1');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/** The profile a new account starts with, and the one a partial profile is filled out with. */
function defaultProfile(user: User): UserProfile {
  return {
    uid: user.uid,
    displayName: user.displayName ?? (user.phoneNumber ?? (user.isAnonymous ? 'Guest' : 'User')),
    email: user.email ?? '',
    phone: user.phoneNumber ?? '',
    memberSince: Date.now(),
    lastLogin: Date.now(),
    isSeller: false,
    isBuyer: false,
    positiveReviews: 0,
    negativeReviews: 0,
    language: 'zh-HK',
    notificationsEnabled: true,
    theme: 'dark',
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const anonSignInInFlight = useRef(false);
  // Used to ignore the brief onAuthStateChanged=null flicker that happens
  // when an anon user upgrades to email/phone (Firebase briefly signs out
  // anon and then signs in the upgraded user).
  const isUpgrading = useRef(false);

  // Set browser local persistence on web. On native, LOCAL is the default
  // and `browserLocalPersistence` is undefined — guard so we don't crash.
  if (typeof window !== 'undefined') {
    setPersistence(auth, browserLocalPersistence).catch((e) => {
      console.warn('[AuthContext] browserLocalPersistence failed, falling back to in-memory:', e);
      return setPersistence(auth, inMemoryPersistence);
    });
  }

  // Listen to Firebase Auth state
  useEffect(() => {
    // A redirect sign-in has to be settled before anything else signs
    // the user in. The anonymous fallback below would otherwise take
    // the session while the redirect result is still waiting, and the
    // result would be lost — the user would come back to the app
    // signed in as a guest instead of as themselves.
    const redirectPending = { current: typeof window !== 'undefined' };

    if (typeof window !== 'undefined') {
      (async () => {
        let cameBackSignedIn = false;
        try {
          const { getRedirectResult } = await import('firebase/auth');
          const result = await getRedirectResult(auth);
          cameBackSignedIn = Boolean(result?.user);
        } catch (e) {
          console.warn('[AuthContext] redirect result failed:', e);
        }
        redirectPending.current = false;

        // Wait for the SDK to settle the initial auth state before
        // deciding that nobody is signed in. A user who was signed in
        // earlier is restored from storage asynchronously, and
        // deciding too early would sign a guest in over the top of
        // them and throw their session away.
        try {
          await auth.authStateReady();
        } catch (e) {
          console.warn('[AuthContext] auth state never settled:', e);
        }

        // Nobody came back from a redirect, and there is no restored
        // user — make sure there is at least a guest to look at.
        if (!cameBackSignedIn && !auth.currentUser && !anonSignInInFlight.current) {
          anonSignInInFlight.current = true;
          try {
            const { signInAnonymously: anonSignIn } = await import('firebase/auth');
            await anonSignIn(auth);
          } catch (e) {
            console.warn('[AuthContext] Anonymous auth not available:', e);
            setUserProfile(null);
          } finally {
            anonSignInInFlight.current = false;
          }
        }
      })();
    }

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      // Every change of the signed-in account is worth a line in the
      // log: "why am I a guest again" is otherwise unanswerable.
      console.info(
        '[auth] state →',
        user ? (user.isAnonymous ? 'guest' : user.email ?? user.uid) : 'signed out',
      );
      setCurrentUser(user);
      if (user) {
        try {
          const snap = await getDoc(doc(db, 'users', user.uid));
          if (snap.exists()) {
            // Merge over the defaults: a profile written by an older
            // version of the app, or written field by field, can be
            // missing fields the screens read — and a missing field
            // reads as undefined, not as the default.
            const stored = {
              ...defaultProfile(user),
              ...(snap.data() as Partial<UserProfile>),
            } as UserProfile;
            setActiveTheme(stored.theme ?? 'dark');
            setUserProfile(stored);
          } else {
            // Create skeleton profile on first login
            const profile: UserProfile = defaultProfile(user);
            await setDoc(doc(db, 'users', user.uid), profile);
            setActiveTheme(profile.theme ?? 'dark');
            setUserProfile(profile);
          }
        } catch (e) {
          console.warn('[AuthContext] profile load/create failed:', e);
        }
      } else if (!isUpgrading.current && !redirectPending.current) {
        // Auto sign-in as anonymous on first visit — but only if not
        // already in-flight, to avoid a re-entrant onAuthStateChanged
        // loop when the anon sign-in itself fires the callback.
        if (!anonSignInInFlight.current) {
          anonSignInInFlight.current = true;
          try {
            const { signInAnonymously: anonSignIn } = await import('firebase/auth');
            await anonSignIn(auth);
          } catch (e) {
            console.warn('[AuthContext] Anonymous auth not available:', e);
            setUserProfile(null);
          } finally {
            anonSignInInFlight.current = false;
          }
        }
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Phone auth: native flow uses Firebase's built-in verification, no
  // `window.recaptchaVerifier` needed. The returned ConfirmationResult
  // is used by the caller to call `confirm(code)`.
  const signInWithPhone = useCallback(async (phone: string) => {
    const { signInWithPhoneNumber } = await import('firebase/auth');
    return signInWithPhoneNumber(auth, phone);
  }, []);

  // Email sign-in: NO auto-create. Returns 'needs_signup' for the caller
  // to route to RegisterScreen.
  const signInWithEmail = useCallback(async (email: string, password: string) => {
    return signInEmailOrPromptSignup(auth, email, password);
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<User | null> => {
    // On web, signInWithPopup works. On React Native, the Firebase JS SDK
    // cannot do Google sign-in directly — use @react-native-google-signin/
    // google-signin, or expo-auth-session with Google provider, or a
    // Cloud Function. For now, surface a clear error on native.
    if (typeof window === 'undefined') {
      throw new Error(
        'Google sign-in on native is not yet configured. ' +
        'Use email/phone sign-in for now.',
      );
    }
    const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } =
      await import('firebase/auth');
    const provider = new GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');

    // A popup is blocked outright by most mobile browsers, and the
    // sign-in then never finishes — the user comes back to the login
    // screen with no error to show for it. A redirect leaves the page
    // and comes back to it, which every browser allows, so mobile goes
    // that way. A desktop browser keeps the popup, which does not take
    // the app off the screen.
    if (isMobileBrowser()) {
      // The redirect comes back to the app root — keep where the user
      // was going so it can be restored.
      rememberReturnPath();
      await signInWithRedirect(auth, provider);
      // The page navigates away here; this never settles.
      return null;
    }

    try {
      const result = await signInWithPopup(auth, provider);
      return result.user;
    } catch (e: any) {
      // A blocked popup is recoverable — fall back to the redirect
      // rather than leaving the user on the login screen.
      if (e?.code === 'auth/popup-blocked') {
        rememberReturnPath();
        await signInWithRedirect(auth, provider);
        return null;
      }
      throw e;
    }
  }, []);

  const signInAnonymously = useCallback(async () => {
    const { signInAnonymously: anonSignIn } = await import('firebase/auth');
    const result = await anonSignIn(auth);
    return result.user;
  }, []);

  // Upgrade an anonymous user to email/password. The same Firebase uid
  // is kept, so all anon-created data (portfolio, listings, orders)
  // remains associated.
  const upgradeFromAnonymous = useCallback(async (email: string, password: string) => {
    if (!currentUser) {
      return { kind: 'error', code: 'no-user', message: '未有當前用戶' } as UpgradeResult;
    }
    isUpgrading.current = true;
    try {
      const r = await upgradeAnonymousToEmail(currentUser, email, password);
      return r;
    } finally {
      // Release the lock after the brief sign-out → sign-in cycle
      setTimeout(() => { isUpgrading.current = false; }, 2000);
    }
  }, [currentUser]);

  /**
   * Register a brand-new email/password account.
   *
   * If the current session is anonymous we upgrade that session instead of
   * creating a fresh one — the uid (and therefore any portfolio data the
   * visitor already created) is preserved. Otherwise a new account is
   * created outright.
   */
  const registerWithEmail = useCallback(async (email: string, password: string): Promise<RegisterResult> => {
    const e = email.trim().toLowerCase();
    if (currentUser?.isAnonymous) {
      const r = await upgradeAnonymousToEmail(currentUser, e, password);
      if (r.kind === 'ok') return r;
      // 'auth/email-already-in-use' means the email belongs to a real
      // account already — the anon uid cannot claim it. Fall through to
      // a direct sign-in so the user still gets an account.
      if (r.code === 'auth/email-already-in-use') {
        const signIn = await signInEmailOrPromptSignup(auth, e, password);
        if (signIn.kind === 'ok') return { kind: 'ok', user: signIn.user };
        if (signIn.kind === 'needs_signup') {
          return { kind: 'error', code: 'auth/email-already-in-use', message: '呢個 Email 已經註冊咗，密碼唔啱' };
        }
        return { kind: 'error', code: signIn.code, message: signIn.message };
      }
      return r;
    }
    return registerWithEmailImpl(auth, e, password);
  }, [currentUser]);

  const signOut = useCallback(async () => {
    await auth.signOut();
  }, []);

  const updateProfile = useCallback(async (data: Partial<UserProfile>) => {
    if (!currentUser) throw new Error('Not logged in');
    await setDoc(doc(db, 'users', currentUser.uid), data, { merge: true });
    // The theme is a palette the whole app reads from, so it is
    // applied before the state change — the screens pick the new
    // colours up on the render that follows.
    if (data.theme) setActiveTheme(data.theme);
    setUserProfile(prev => prev ? { ...prev, ...data } : null);
  }, [currentUser]);

  const setTransactionPin = useCallback(async (pin: string) => {
    if (!currentUser) throw new Error('Not logged in');
    const hash = await hashPin(pin);
    await setDoc(doc(db, 'users', currentUser.uid), { transactionPinHash: hash }, { merge: true });
  }, [currentUser]);

  const verifyTransactionPin = useCallback(async (pin: string): Promise<boolean> => {
    if (!currentUser || !userProfile?.transactionPinHash) return false;

    // Lockout check
    if (isPinVerifyLocked()) {
      const remaining = Math.ceil(getPinLockoutRemainingMs() / 1000);
      throw new Error(`交易密碼已鎖定，請等待 ${remaining} 秒後再試`);
    }
    // Cooldown: at least PIN_MIN_INTERVAL_MS between attempts
    const now = Date.now();
    if (now - pinVerifyState.lastAttempt < PIN_MIN_INTERVAL_MS) {
      throw new Error('請稍候片刻再試');
    }
    pinVerifyState.lastAttempt = now;

    const hash = await hashPin(pin);
    const ok = hash === userProfile.transactionPinHash;

    if (!ok) {
      // Track failed attempts in the window
      pinVerifyState.failedTimestamps = pinVerifyState.failedTimestamps
        .filter(ts => now - ts < PIN_FAILED_WINDOW_MS);
      pinVerifyState.failedTimestamps.push(now);
      if (pinVerifyState.failedTimestamps.length >= PIN_LOCKOUT_THRESHOLD) {
        pinVerifyState.lockedUntil = now + PIN_LOCKOUT_DURATION_MS;
        pinVerifyState.failedTimestamps = [];
      }
    } else {
      pinVerifyState.failedTimestamps = [];
      pinVerifyState.lockedUntil = 0;
    }
    return ok;
  }, [currentUser, userProfile]);

  const refreshSession = useCallback(async () => {
    return refreshSessionImpl(auth);
  }, []);

  const isAnonymous = currentUser?.isAnonymous ?? false;

  return (
    <AuthContext.Provider value={{
      currentUser, userProfile, loading, isAnonymous,
      signInWithPhone, signInWithEmail, signInWithGoogle, signInAnonymously,
      upgradeFromAnonymous, registerWithEmail,
      signOut,
      updateProfile, setTransactionPin, verifyTransactionPin,
      refreshSession, isPhoneProviderDisabled,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
