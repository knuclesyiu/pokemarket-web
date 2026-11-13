/**
 * End-to-end smoke test of the PokeMarket trade flow.
 *
 * Runs against the local Firebase emulators — auth, Firestore and
 * functions — and exercises the flow the app actually has:
 *
 *   1. two people register
 *   2. the seller lists a card they hold
 *   3. the buyer sees it and makes an offer with a card of their own
 *   4. the buyer tries to accept their own offer — must be refused
 *   5. the seller accepts
 *   6. the cards actually move, the listing is sold, a trade is recorded
 *   7. the total number of cards across both portfolios is unchanged
 *
 * Step 7 is the one that matters. A trade that moves one card without
 * moving the other looks correct in the UI and destroys the economy.
 *
 * Run:
 *   npx firebase-tools emulators:start --only auth,firestore,functions
 *   node scripts/smoke_e2e.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { initializeApp } = require('firebase/app');
const {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} = require('firebase/auth');
const {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDoc,
  collection,
  getDocs,
} = require('firebase/firestore');
const { getFunctions, connectFunctionsEmulator, httpsCallable } =
  require('firebase/functions');

const admin = require(
  path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    '../functions/node_modules/firebase-admin'
  )
);

/* ── config ─────────────────────────────────────────────────── */

function readEnv() {
  const file = path.resolve('.env');
  if (!fs.existsSync(file)) throw new Error('.env not found');
  const out = {};
  for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const env = readEnv();
const PROJECT = 'pokemarket-255c6';
const AUTH = 'http://127.0.0.1:9099';
const FIRESTORE = '127.0.0.1';
const FIRESTORE_PORT = 8081;
const FUNCTIONS = '127.0.0.1';
const FUNCTIONS_PORT = 5001;

const app = initializeApp({
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
  projectId: PROJECT,
  storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
});

const auth = getAuth(app);
connectAuthEmulator(auth, AUTH, { disableWarnings: true });

const db = getFirestore(app);
connectFirestoreEmulator(db, FIRESTORE, FIRESTORE_PORT);

const fns = getFunctions(app);
connectFunctionsEmulator(fns, FUNCTIONS, FUNCTIONS_PORT);

admin.initializeApp({ projectId: PROJECT });
const adm = admin.firestore();
adm.settings({ host: `${FIRESTORE}:${FIRESTORE_PORT}`, projectId: PROJECT, ssl: false });

/* ── helpers ────────────────────────────────────────────────── */

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

/**
 * A caller that is signed in as that person.
 *
 * The `auth` option on a callable is not honoured by the emulator, so
 * the session is refreshed before every call instead. The app itself
 * always relies on the ambient signed-in user, which is the behaviour
 * being tested here.
 */
async function asUser(email, password) {
  await signOut(auth);
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const user = cred.user;
  return {
    uid: user.uid,
    token: await user.getIdToken(),
    async call(name, data) {
      // Make sure the session is this person's, not the last one's.
      if (auth.currentUser?.uid !== user.uid) {
        await signOut(auth);
        await signInWithEmailAndPassword(auth, email, password);
      }
      return httpsCallable(fns, name)(data);
    },
  };
}

async function portfolioOf(uid) {
  const snap = await adm.collection(`users/${uid}/portfolio`).get();
  const map = {};
  for (const d of snap.docs) {
    map[d.id] = Number(d.data().quantity ?? 0);
  }
  return map;
}

const total = (m) => Object.values(m).reduce((a, b) => a + b, 0);

const stamp = Date.now();
const SELLER = { email: `seller${stamp}@pokemarket.test`, password: 'TestPass123!' };
const BUYER = { email: `buyer${stamp}@pokemarket.test`, password: 'TestPass123!' };

/* ── the flow ───────────────────────────────────────────────── */

console.log('\n── 1. 兩個人註冊');
await createUserWithEmailAndPassword(auth, SELLER.email, SELLER.password);
await signOut(auth);
await createUserWithEmailAndPassword(auth, BUYER.email, BUYER.password);
await signOut(auth);

const seller = await asUser(SELLER.email, SELLER.password);
const buyer = await asUser(BUYER.email, BUYER.password);
check('賣家註冊', !!seller.uid, seller.uid);
check('買家註冊', !!buyer.uid, buyer.uid);

const SELLER_CARD = 'test-card-charizard-001';
const BUYER_CARD = 'test-card-pikachu-002';

console.log('\n── 2. 種入卡片（模擬已經有卡嘅用家）');
// A profile, so the listing carries a seller name.
await adm.doc(`users/${seller.uid}`).set({
  uid: seller.uid, email: SELLER.email, displayName: '測試賣家', createdAt: Date.now(),
});
await adm.doc(`users/${buyer.uid}`).set({
  uid: buyer.uid, email: BUYER.email, displayName: '測試買家', createdAt: Date.now(),
});
await adm.doc(`users/${seller.uid}/portfolio/${SELLER_CARD}`).set({
  cardId: SELLER_CARD, quantity: 1, avgBuyPrice: 100, condition: 'Near Mint', source: 'seed', addedAt: Date.now(),
});
await adm.doc(`users/${buyer.uid}/portfolio/${BUYER_CARD}`).set({
  cardId: BUYER_CARD, quantity: 1, avgBuyPrice: 50, condition: 'Near Mint', source: 'seed', addedAt: Date.now(),
});
const sellerBefore = await portfolioOf(seller.uid);
const buyerBefore = await portfolioOf(buyer.uid);
check('賣家持有掛牌卡', sellerBefore[SELLER_CARD] === 1, JSON.stringify(sellerBefore));
check('買家持有出價卡', buyerBefore[BUYER_CARD] === 1, JSON.stringify(buyerBefore));

console.log('\n── 3. 賣家掛牌');
console.log(`     賣家 uid=${seller.uid}`);
console.log(`     買家 uid=${buyer.uid}`);
const listed = await seller.call('createListing', {
  cardId: SELLER_CARD,
  cardName: 'Test Charizard',
  price: 250,
  condition: 'Near Mint',
  type: 'buy_now',
});
check('掛牌建立', !!listed.data.listingId, listed.data.listingId);

console.log('\n── 4. 買家見到掛牌');
const listings = await buyer.call('getMarketListings', {});
const found = (listings.data.listings ?? []).find(
  (l) => l.id === listed.data.listingId
);
check('買家睇到掛牌', !!found, found ? `${found.cardName} HK$${found.price}` : '');
check('掛牌有 nested card 物件', !!(found?.card?.id), found?.card?.id ?? '');
check('賣家名唔係空', !!(found?.sellerName), found?.sellerName ?? '(空)');
console.log(`     listing.sellerId=${found?.sellerId}`);
console.log(`     賣家 uid=${seller.uid} / 買家 uid=${buyer.uid}`);
check('掛牌屬於賣家', found?.sellerId === seller.uid, found?.sellerId ?? '');

console.log('\n── 5. 買家出價');
const offered = await buyer.call('createOffer', {
  listingId: listed.data.listingId,
  offerCards: [{ card: { id: BUYER_CARD, name: 'Test Pikachu' }, condition: 'Near Mint' }],
  cashAddHkd: 50,
  message: 'trade?',
});
check('出價建立', !!offered.data.offerId, offered.data.offerId);

console.log('\n── 6. 安全：買家唔可以自己接自己個出價');
let selfAcceptBlocked = false;
let selfAcceptError = '';
try {
  await buyer.call('respondToOffer', {
    offerId: offered.data.offerId,
    action: 'accept',
  });
} catch (e) {
  selfAcceptBlocked = true;
  selfAcceptError = e?.message ?? String(e);
}
check('買家自己 accept 被拒', selfAcceptBlocked, selfAcceptError.slice(0, 90));

console.log('\n── 7. 賣家接受');
const accepted = await seller.call('respondToOffer', {
  offerId: offered.data.offerId,
  action: 'accept',
});
check('賣家 accept 成功', accepted.data.newStatus === 'accepted', accepted.data.newStatus);

console.log('\n── 8. 卡片真係郁咗？');
const sellerAfter = await portfolioOf(seller.uid);
const buyerAfter = await portfolioOf(buyer.uid);
console.log(`     賣家 前 ${JSON.stringify(sellerBefore)} → 後 ${JSON.stringify(sellerAfter)}`);
console.log(`     買家 前 ${JSON.stringify(buyerBefore)} → 後 ${JSON.stringify(buyerAfter)}`);

check('賣家冇晒掛牌卡', (sellerAfter[SELLER_CARD] ?? 0) === 0);
check('買家收到掛牌卡', (buyerAfter[SELLER_CARD] ?? 0) === 1);
check('買家交出咗自己張卡', (buyerAfter[BUYER_CARD] ?? 0) === 0);
check('賣家收到買家張卡', (sellerAfter[BUYER_CARD] ?? 0) === 1);

const before = total(sellerBefore) + total(buyerBefore);
const after = total(sellerAfter) + total(buyerAfter);
check('總卡數守恆', before === after, `${before} → ${after}`);

console.log('\n── 9. 掛牌同交易紀錄');
const listingSnap = await adm.doc(`listings/${listed.data.listingId}`).get();
check('掛牌標記為已售', listingSnap.data()?.status === 'sold', listingSnap.data()?.status);

const trades = await adm.collection('trades').where('listingId', '==', listed.data.listingId).get();
check('有交易紀錄', !trades.empty, `${trades.size} 筆`);
const trade = trades.docs[0]?.data();
check('交易狀態係 completed', trade?.status === 'completed', trade?.status);
check('交易類型係 offer_accepted', trade?.tradeType === 'offer_accepted', trade?.tradeType);

const offerSnap = await adm.doc(`offers/${offered.data.offerId}`).get();
check('出價狀態變 accepted', offerSnap.data()?.status === 'accepted', offerSnap.data()?.status);

/* ── cleanup ────────────────────────────────────────────────── */

console.log('\n── 清理');
for (const uid of [seller.uid, buyer.uid]) {
  await adm.doc(`users/${uid}`).delete();
  await adm.collection('users').doc(uid).delete().catch(() => {});
}
await adm.doc(`listings/${listed.data.listingId}`).delete();
await adm.doc(`offers/${offered.data.offerId}`).delete();
for (const d of trades.docs) await d.ref.delete();

console.log(
  failures === 0
    ? '\n✅ 全部通過'
    : `\n❌ ${failures} 項失敗`
);
process.exit(failures === 0 ? 0 : 1);
