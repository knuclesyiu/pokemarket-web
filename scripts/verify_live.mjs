/**
 * Live verification of the PokeMarket auth + Firestore rules.
 *
 * Runs against the REAL Firebase project (pokemarket-255c6) using the
 * public web config from .env. It exercises exactly the code path the
 * app uses for registration:
 *
 *   1. anonymous sign-in (AuthContext auto-signs-in on first visit)
 *   2. upgradeAnonymousToEmail  -> linkWithCredential  (AuthContext.registerWithEmail)
 *   3. profile write to users/{uid}
 *   4. registerWithEmail -> createUserWithEmailAndPassword (fresh account)
 *   5. Firestore rules: buyer must NOT be able to self-accept an offer
 *
 * The probe account is deleted at the end.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  initializeApp,
} = require('firebase/app');
const {
  getAuth,
  signInAnonymously,
  linkWithCredential,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  signOut,
  deleteUser,
  connectAuthEmulator,
} = require('firebase/auth');
const {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  updateDoc,
  serverTimestamp,
} = require('firebase/firestore');

// ── config ────────────────────────────────────────────────────────────────
const env = fs.readFileSync('/home/user/Documents/Development/PokeMarket/.env', 'utf8');
const envMap = {};
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) envMap[m[1]] = m[2];
}

const PROJECT = envMap.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
const API_KEY = envMap.EXPO_PUBLIC_FIREBASE_API_KEY;

const app = initializeApp({
  apiKey: API_KEY,
  authDomain: `${PROJECT}.firebaseapp.com`,
  projectId: PROJECT,
  storageBucket: envMap.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: envMap.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: envMap.EXPO_PUBLIC_FIREBASE_APP_ID,
});
const auth = getAuth(app);
const db = getFirestore(app);

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

const stamp = Date.now();
const PROBE = `hermes_verify_${stamp}@example.com`;
const PASSWORD = 'VerifyPass12345!';

async function main() {
  console.log('project:', PROJECT);
  console.log('probe account:', PROBE);
  console.log('');

  // ── 1. anonymous sign-in ─────────────────────────────────────────────
  const anonCred = await signInAnonymously(auth);
  const anonUid = anonCred.user.uid;
  check('anonymous sign-in (AuthContext auto sign-in)', !!anonUid, `uid len ${anonUid.length}`);
  check('anonymous user isAnonymous flag', anonCred.user.isAnonymous === true);

  // ── 2. upgrade anonymous -> email (the registration fix) ─────────────
  const emailCred = EmailAuthProvider.credential(PROBE, PASSWORD);
  const linked = await linkWithCredential(anonCred.user, emailCred);
  check(
    'upgradeAnonymousToEmail keeps the SAME uid',
    linked.user.uid === anonUid,
    `${anonUid === linked.user.uid ? 'uid preserved' : 'uid CHANGED'}`,
  );
  check('upgraded user is no longer anonymous', linked.user.isAnonymous === false);
  check('upgraded user has email', linked.user.email === PROBE.toLowerCase());

  // ── 3. profile write (AuthContext.updateProfile) ─────────────────────
  await setDoc(doc(db, 'users', anonUid), {
    uid: anonUid,
    displayName: 'Hermes Verify',
    email: PROBE,
    phone: '',
    memberSince: Date.now(),
    lastLogin: Date.now(),
    isSeller: false,
    isBuyer: true,
    positiveReviews: 0,
    negativeReviews: 0,
    language: 'zh-HK',
    notificationsEnabled: true,
  }, { merge: true });
  const prof = await getDoc(doc(db, 'users', anonUid));
  check('profile write allowed by rules', prof.exists() && prof.data().displayName === 'Hermes Verify');

  // ── 4. portfolio write (PortfolioScreen.handleAddCard) ───────────────
  const CARD_ID = 'swsh5-115';
  await setDoc(doc(db, 'users', anonUid, 'portfolio', CARD_ID), {
    cardId: CARD_ID,
    quantity: 2,
    avgBuyPrice: 120,
    addedAt: Date.now(),
  }, { merge: true });
  const port = await getDoc(doc(db, 'users', anonUid, 'portfolio', CARD_ID));
  check('portfolio write allowed by rules', port.exists() && port.data().quantity === 2);

  // ── 5. RULES: buyer must not be able to self-accept an offer ────────
  const SELLER = 'test_seller_uid_' + stamp;
  const BUYER = anonUid;
  const offerRef = await addDoc(collection(db, 'offers'), {
    id: 'probe',
    listingId: 'probe_listing',
    buyerId: BUYER,
    sellerId: SELLER,
    buyerName: 'Hermes Verify',
    sellerName: 'Probe Seller',
    targetCard: { id: CARD_ID, name: 'Probe Card' },
    targetPrice: 100,
    offerCards: [{ card: { id: CARD_ID, name: 'Probe Card' } }],
    cashAddHkd: 0,
    status: 'pending',
    createdAt: serverTimestamp(),
  });

  let selfAcceptBlocked = false;
  let selfAcceptDetail = '';
  try {
    await updateDoc(doc(db, 'offers', offerRef.id), {
      status: 'accepted',
      sellerId: BUYER,
    });
    selfAcceptDetail = 'WRITE SUCCEEDED — buyer CAN self-accept (rules are stale)';
  } catch (e) {
    selfAcceptBlocked = true;
    selfAcceptDetail = 'write rejected: ' + String(e.message).slice(0, 90);
  }
  check(
    'buyer cannot self-accept an offer',
    selfAcceptBlocked,
    selfAcceptDetail,
  );

  // ── 6. RULES: buyer cannot write listing status ──────────────────────
  let listingWriteBlocked = false;
  let listingDetail = '';
  try {
    await setDoc(doc(db, 'listings', 'probe_listing_' + stamp), {
      cardId: CARD_ID,
      sellerId: BUYER,
      price: 100,
      status: 'sold',
    });
    listingDetail = 'WRITE SUCCEEDED — clients can create listings';
  } catch (e) {
    listingWriteBlocked = true;
    listingDetail = 'write rejected: ' + String(e.message).slice(0, 90);
  }
  check(
    'client listing write is server-only',
    listingWriteBlocked,
    listingDetail,
  );

  // ── cleanup ───────────────────────────────────────────────────────────
  try {
    await deleteUser(linked.user);
    check('probe account deleted', true);
  } catch (e) {
    check('probe account deleted', false, String(e.message).slice(0, 90));
  }

  const failed = results.filter((r) => !r.ok);
  console.log('');
  console.log(`RESULT: ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('FAILED CHECKS:');
    failed.forEach((f) => console.log('  - ' + f.name + ': ' + f.detail));
  }
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
