/**
 * AuthContext — manages Firebase Auth state + user profile from Firestore
 */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, ConfirmationResult } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { UserProfile } from '../types/user';

interface AuthContextValue {
  currentUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isAnonymous: boolean;
  signInWithPhone: (phone: string) => Promise<ConfirmationResult>;
  signInWithEmail: (email: string, password: string) => Promise<User>;
  signInWithGoogle: () => Promise<User>;
  signInAnonymously: () => Promise<User>;
  upgradeFromAnonymous: () => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
  setTransactionPin: (pin: string) => Promise<void>;
  verifyTransactionPin: (pin: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  return useContext(AuthContext)!;
}

async function hashPin(pin: string): Promise<string> {
  // Simple hash using SubtleCrypto (available in React Native / Expo)
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

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setCurrentUser(user);
      if (user) {
        // Load user profile from Firestore
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
      } else {
        // Auto sign-in as anonymous on first visit
        try {
          const { signInAnonymously: anonSignIn } = await import('firebase/auth');
          await anonSignIn(auth);
        } catch (e) {
          // Anonymous auth not enabled, do nothing
          console.warn('Anonymous auth not enabled:', e);
        }
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signInWithPhone = async (phone: string) => {
    const { signInWithPhoneNumber } = await import('firebase/auth');
    const verifier = (window as any).recaptchaVerifier;
    return signInWithPhoneNumber(auth, phone, verifier);
  };

  const signInWithEmail = async (email: string, password: string) => {
    const { signInWithEmailAndPassword, createUserWithEmailAndPassword } = await import('firebase/auth');
    try {
      return (await signInWithEmailAndPassword(auth, email, password)).user;
    } catch (e: any) {
      if (e.code === 'auth/user-not-found') {
        return (await createUserWithEmailAndPassword(auth, email, password)).user;
      }
      throw e;
    }
  };

  const signOut = async () => {
    await auth.signOut();
  };

  const signInWithGoogle = async () => {
    const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
    const provider = new GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');
    const result = await signInWithPopup(auth, provider);
    return result.user;
  };

  const signInAnonymously = async () => {
    const { signInAnonymously: anonSignIn } = await import('firebase/auth');
    const result = await anonSignIn(auth);
    return result.user;
  };

  const upgradeFromAnonymous = async () => {
    // Link anonymous account to phone/email/google
    // This is called when user wants to create full account
    // The actual linking happens in the login flow
  };

  const updateProfile = async (data: Partial<UserProfile>) => {
    if (!currentUser) throw new Error('Not logged in');
    await setDoc(doc(db, 'users', currentUser.uid), data, { merge: true });
    setUserProfile(prev => prev ? { ...prev, ...data } : null);
  };

  const setTransactionPin = async (pin: string) => {
    if (!currentUser) throw new Error('Not logged in');
    const hash = await hashPin(pin);
    await setDoc(doc(db, 'users', currentUser.uid), { transactionPinHash: hash }, { merge: true });
  };

  const verifyTransactionPin = async (pin: string): Promise<boolean> => {
    if (!currentUser || !userProfile?.transactionPinHash) return false;
    const hash = await hashPin(pin);
    return hash === userProfile.transactionPinHash;
  };

  const isAnonymous = currentUser?.isAnonymous ?? false;

  return (
    <AuthContext.Provider value={{
      currentUser, userProfile, loading, isAnonymous,
      signInWithPhone, signInWithEmail, signInWithGoogle, signInAnonymously, upgradeFromAnonymous,
      signOut,
      updateProfile, setTransactionPin, verifyTransactionPin,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
