/**
 * PokeMarket — Firebase Configuration
 * Reads config from environment variables (EXPO_PUBLIC_*).
 * Environment variables are defined in .env at project root.
 */

import { initializeApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth, connectAuthEmulator } from "firebase/auth";
import {
  getFirestore,
  Firestore,
  connectFirestoreEmulator,
} from "firebase/firestore";
import {
  getFunctions,
  Functions,
  connectFunctionsEmulator,
} from "firebase/functions";

const PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? "pokemarket-255c6";

/**
 * Point the SDKs at the local emulator suite.
 *
 * The emulator is how the trade flow gets proven before the live
 * project is touched, and until now the app could only be driven
 * against it by a script. Setting EXPO_PUBLIC_USE_EMULATOR=true and
 * rebuilding lets the app itself run against the emulator, which is
 * the only way to check a screen whose data comes from the server —
 * a wallet balance, for instance, which the rules keep server-only.
 *
 * Off by default. The deployed build never sets it.
 */
const USE_EMULATOR = process.env.EXPO_PUBLIC_USE_EMULATOR === "true";
const EMULATOR_HOST = process.env.EXPO_PUBLIC_EMULATOR_HOST ?? "127.0.0.1";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: `${PROJECT_ID}.firebaseapp.com`,
  projectId: PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Initialize once
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let functions: Functions;

export function initFirebase() {
  if (!app) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    // Functions are deployed in us-central1 — must match or calls will 404
    functions = getFunctions(app, "us-central1");

    if (USE_EMULATOR) {
      connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, {
        disableWarnings: true,
      });
      connectFirestoreEmulator(db, EMULATOR_HOST, 8081);
      connectFunctionsEmulator(functions, EMULATOR_HOST, 5001);
      console.log(
        `[firebase] using the emulator at ${EMULATOR_HOST} ` +
          `(auth 9099, firestore 8081, functions 5001)`,
      );
    }
  }
  return { app, auth, db, functions };
}

export { auth, db, functions };
export default initFirebase;