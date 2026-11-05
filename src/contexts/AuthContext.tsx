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
import { UserProfile } from '../types/user';
import {
  signInEmailOrPromptSignup, EmailSignInResult,
  upgradeAnonymousToEmail, UpgradeResult,
  registerWithEmail as registerWithEmailImpl, RegisterResult,
  refreshSession as refreshSessionImpl,
  isPhoneProviderDisabled,
} from '../services/authFlow';

interface AuthContextValue {
  currentUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isAnonymous: boolean;
  signInWithPhone: (phone: string) => Promise<ConfirmationResult>;
  signInWithEmail: (email: string, password: string) => Promise<EmailSignInResult>;
  signInWithGoogle: () => Promise<User>;
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
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const snap = await getDoc(doc(db, 'users', user.uid));
          if (snap.exists()) {
            setUserProfile(snap.data() as UserProfile);
          } else {
            // Create skeleton profile on first login
            const profile: UserProfile = {
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
            };
            await setDoc(doc(db, 'users', user.uid), profile);
            setUserProfile(profile);
          }
        } catch (e) {
          console.warn('[AuthContext] profile load/create failed:', e);
        }
      } else if (!isUpgrading.current) {
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

  const signInWithGoogle = useCallback(async () => {
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
    const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
    const provider = new GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');
    const result = await signInWithPopup(auth, provider);
    return result.user;
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
