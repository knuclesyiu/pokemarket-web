/**
 * Probe what the LIVE Firestore rules on pokemarket-255c6 actually allow.
 *
 * The repo's firestore.rules may not be what is deployed. This tries a
 * representative write against each collection a signed-in user touches
 * and reports which succeed.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { initializeApp } = require('firebase/app');
const {
  getAuth, signInAnonymously, linkWithCredential, EmailAuthProvider, deleteUser,
} = require('firebase/auth');
const {
  getFirestore, doc, setDoc, getDoc, getDocs, collection, addDoc, updateDoc,
  query, where, serverTimestamp,
} = require('firebase/firestore');

const env = fs.readFileSync('.env', 'utf8');
const envMap = {};
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) envMap[m[1]] = m[2];
}

const PROJECT = envMap.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
const app = initializeApp({
  apiKey: envMap.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: `${PROJECT}.firebaseapp.com`,
  projectId: PROJECT,
  storageBucket: envMap.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: envMap.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: envMap.EXPO_PUBLIC_FIREBASE_APP_ID,
});
const auth = getAuth(app);
const db = getFirestore(app);

const stamp = Date.now();
const PROBE = `hermes_rules_${stamp}@example.com`;
const PASSWORD = 'VerifyPass12345!';

async function probe(label, fn) {
  try {
    await fn();
    console.log(`ALLOWED   ${label}`);
    return true;
  } catch (e) {
    const code = e.code === 'permission-denied' ? 'PERMISSION_DENIED' : (e.code || e.message).slice(0, 50);
    console.log(`BLOCKED   ${label}  [${code}]`);
    return false;
  }
}

async function main() {
  const anon = await signInAnonymously(auth);
  const linked = await linkWithCredential(anon.user, EmailAuthProvider.credential(PROBE, PASSWORD));
  const uid = linked.user.uid;
  console.log('signed in as', uid, '\n');

  await probe('READ  card_prices (public catalog)', async () => {
    await getDocs(query(collection(db, 'card_prices'), where('priceHkd', '>', 0), ));
  });
  await probe('WRITE card_prices (must be server-only)', async () => {
    await setDoc(doc(db, 'card_prices', `hermes_probe_${stamp}`), { name: 'x', priceHkd: 1 });
  });

  await probe('READ  users/{ownUid}', async () => {
    await getDoc(doc(db, 'users', uid));
  });
  await probe('WRITE users/{ownUid}  (profile create)', async () => {
    await setDoc(doc(db, 'users', uid), {
      uid, displayName: 'Rules Probe', email: PROBE, language: 'zh-HK',
      isBuyer: true, isSeller: false, positiveReviews: 0, negativeReviews: 0,
      notificationsEnabled: true, memberSince: Date.now(),
    });
  });
  await probe('WRITE users/{ownUid}/portfolio (add card)', async () => {
    await setDoc(doc(db, 'users', uid, 'portfolio', 'swsh5-115'), {
      cardId: 'swsh5-115', quantity: 1, avgBuyPrice: 100, addedAt: Date.now(),
    });
  });

  await probe('READ  listings (public catalog)', async () => {
    await getDocs(collection(db, 'listings'));
  });
  await probe('WRITE listings (must be server-only)', async () => {
    await setDoc(doc(db, 'listings', `hermes_probe_${stamp}`), {
      cardId: 'swsh5-115', sellerId: uid, price: 100, status: 'active',
    });
  });

  await probe('WRITE offers (create own)', async () => {
    await addDoc(collection(db, 'offers'), {
      listingId: 'x', buyerId: uid, sellerId: 'other', status: 'pending',
      createdAt: serverTimestamp(),
    });
  });

  console.log('\n--- cleanup ---');
  try {
    await deleteUser(linked.user);
    console.log('probe account deleted');
  } catch (e) {
    console.log('cleanup failed:', String(e.message).slice(0, 80));
  }
}

main().catch((e) => { console.error('FATAL', String(e.message).slice(0, 200)); process.exit(1); });
