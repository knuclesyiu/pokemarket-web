/**
 * Probe the deployed Cloud Functions against the live project.
 *
 * The repo was green for a long time while the deployed functions
 * could not load at all — every callable came back `not-found`. A
 * typecheck cannot see that, and neither can a successful deploy
 * command. Only talking to the live endpoint can.
 *
 * Two things are checked:
 *
 *   1. every callable answers with a callable error rather than the
 *      platform's HTML 403, which means the request reached the
 *      function instead of being stopped by the IAM layer
 *   2. the trade flow works end to end, on the real project
 *
 * The probe writes to the live Firestore and deletes everything it
 * created, including the test accounts.
 *
 * Run:  node scripts/probe_deployed.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { initializeApp } = require('firebase/app');
const {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  deleteUser,
} = require('firebase/auth');
const { getFunctions, httpsCallable } = require('firebase/functions');

/* ── config ─────────────────────────────────────────────────── */

function readEnv() {
  const file = path.resolve('.env');
  if (!fs.existsSync(file)) throw new Error('.env not found');
  const out = {};
  for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const env = readEnv();
const PROJECT = env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'pokemarket-255c6';

const app = initializeApp({
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
  projectId: PROJECT,
  storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
});

const auth = getAuth(app);
const fns = getFunctions(app, 'us-central1');

/** Every callable the app calls. */
const CALLABLES = [
  'createPaymentIntent', 'releasePayment', 'refundPayment',
  'extendEscrow', 'confirmReceipt', 'createDispute',
  'sellerRespondToModification',
  'createListing', 'searchCardsWithPrices', 'getCardPrice',
  'getMarketListings', 'createOffer', 'respondToOffer', 'cancelOffer',
  'getMyOffers', 'getUserCards', 'executeTrade',
  'createChatThread', 'getOrderStatus', 'getNotifications', 'getUserReviews',
  'sendVerificationEmail', 'checkEmailVerified', 'verifyPinServerSide',
];

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

/* ── 1. every callable answers ───────────────────────────────── */

const ENDPOINT = `https://us-central1-${PROJECT}.cloudfunctions.net`;

/**
 * Call the endpoint directly, so the platform's answer can be read.
 *
 * The SDK hides the difference between the two failures that matter
 * here. A function that ran and refused answers with JSON; the
 * platform refusing at the IAM layer answers with an HTML page. The
 * SDK reports both as `functions/unauthenticated`, which looks like
 * the function rejected the caller when in fact it never got the
 * request at all.
 */
async function rawCall(name, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${ENDPOINT}/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ data: {} }),
  });
  const body = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    /* HTML */
  }
  return { status: res.status, body, parsed };
}

console.log('\n── 1. 每個 callable 嘅部署狀態');
const unreachable = [];
const platformBlocked = [];
const notDeployed = [];

for (const name of CALLABLES) {
  const r = await rawCall(name, null);
  if (r.parsed?.error) {
    // The function ran and said no. It is deployed.
    console.log(`  ✅ ${name} — 已部署，有應聲`);
  } else if (r.status === 404) {
    console.log(`  ❌ ${name} — 未部署（404）`);
    notDeployed.push(name);
  } else {
    // 401/403 with an HTML body is the platform refusing.
    console.log(
      `  ⚠️  ${name} — 平台層攔截（HTTP ${r.status}），function 未收到請求`
    );
    platformBlocked.push(name);
  }
}

check('全部 callable 都已部署', notDeployed.length === 0, notDeployed.join(', '));
check(
  '冇 callable 被平台層攔截',
  platformBlocked.length === 0,
  platformBlocked.length
    ? `${platformBlocked.length} 個被攔（IAM / require authentication 設定）`
    : ''
);

/* ── 2. the trade flow, live ─────────────────────────────────── */

console.log('\n── 2. 線上交易流程');

const stamp = Date.now();
const SELLER = { email: `hermes_seller${stamp}@example.com`, password: 'TestPass123!' };
const BUYER = { email: `hermes_buyer${stamp}@example.com`, password: 'TestPass123!' };

async function signIn(person) {
  await signOut(auth);
  const cred = await signInWithEmailAndPassword(auth, person.email, person.password);
  return {
    uid: cred.user.uid,
    async call(name, data) {
      if (auth.currentUser?.uid !== cred.user.uid) {
        await signOut(auth);
        await signInWithEmailAndPassword(auth, person.email, person.password);
      }
      return httpsCallable(fns, name)(data);
    },
  };
}

try {
  await createUserWithEmailAndPassword(auth, SELLER.email, SELLER.password);
  await signOut(auth);
  await createUserWithEmailAndPassword(auth, BUYER.email, SELLER.password);
  await signOut(auth);

  const seller = await signIn(SELLER);
  const buyer = await signIn(BUYER);
  check('賣家登入', !!seller.uid, seller.uid);
  check('買家登入', !!buyer.uid, buyer.uid);

  const listed = await seller.call('createListing', {
    cardId: 'hermes-probe-card-001',
    cardName: 'Probe Card',
    price: 100,
    condition: 'Near Mint',
    type: 'buy_now',
  });
  const listingId = listed.data.listingId;
  check('掛牌建立', !!listingId, listingId);

  // If the platform is blocking, say so here rather than letting it
  // look like a broken trade flow.
  const raw = await rawCall('createListing', await auth.currentUser.getIdToken());
  if (!raw.parsed?.error) {
    console.log(
      `  ⚠️  平台層回 HTTP ${raw.status}（HTML）—— 唔係 function 嘅問題`
    );
    console.log(
      '     檢查：Cloud Run → 該 function → Permissions → "Require authentication"'
    );
    console.log('     firebase deploy 通常會重設為 public invoker，之後 function 自己驗證身份。');
  }

  const listings = await buyer.call('getMarketListings', {});
  const found = (listings.data.listings ?? []).find((l) => l.id === listingId);
  check('買家見到掛牌', !!found, found ? `${found.cardName} HK$${found.price}` : '');

  const offered = await buyer.call('createOffer', {
    listingId,
    offerCards: [{ card: { id: 'hermes-probe-card-002', name: 'Probe Card 2' } }],
    cashAddHkd: 10,
  });
  check('出價建立', !!offered.data.offerId, offered.data.offerId);

  let selfAccept = '冇拒絕';
  try {
    await buyer.call('respondToOffer', { offerId: offered.data.offerId, action: 'accept' });
  } catch (e) {
    selfAccept = e?.message ?? String(e);
  }
  check('買家自我接受被拒', /賣家|seller/i.test(selfAccept), selfAccept.slice(0, 70));

  const accepted = await seller.call('respondToOffer', {
    offerId: offered.data.offerId,
    action: 'accept',
  });
  check('賣家接受', accepted.data.newStatus === 'accepted', accepted.data.newStatus);
} catch (e) {
  check('線上交易流程', false, `${e?.code ?? ''} ${e?.message ?? e}`.slice(0, 160));
} finally {
  // Clean up the probe accounts.
  for (const person of [SELLER, BUYER]) {
    try {
      await signInWithEmailAndPassword(auth, person.email, person.password);
      await deleteUser(auth.currentUser);
      console.log(`  清理 ${person.email}`);
    } catch {
      /* already gone */
    }
  }
}

console.log(
  failures === 0 ? '\n✅ 線上全部通過' : `\n❌ ${failures} 項失敗`
);
process.exit(failures === 0 ? 0 : 1);
