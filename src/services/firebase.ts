/**
 * PokeMarket — Firebase Configuration
 * Replace with your actual Firebase project config.
 */

import { initializeApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getFunctions, Functions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyCZFuIC5gSqxLN8xGpmhgluLlJM7ZFLWGc",
  authDomain: "pokemarket-255c6.firebaseapp.com",
  projectId: "pokemarket-255c6",
  storageBucket: "pokemarket-255c6.firebasestorage.app",
  messagingSenderId: "129667382439",
  appId: "1:129667382439:web:6762742bf2a14fa7bbaf82",
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
    // ⚠️ Functions 部署在 us-central1，必須對齊，否則 callable 會 404
    functions = getFunctions(app, "us-central1");
  }
  return { app, auth, db, functions };
}

export { auth, db, functions };
export default initFirebase;
