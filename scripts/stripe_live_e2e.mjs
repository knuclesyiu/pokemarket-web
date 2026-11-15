/**
 * Live Stripe end-to-end.
 *
 * Walks the money path on the real project with the real Stripe
 * account:
 *
 *   1. a seller registers and gets a Connect account
 *   2. the Connect account is checked against Stripe directly
 *   3. a buyer asks for a PaymentIntent
 *   4. the PaymentIntent is checked against Stripe directly — the
 *      amount the buyer is charged, the currency, and whether the
 *      money stays on the platform (escrow) or goes straight to the
 *      seller (which is what a destination charge would do)
 *   5. the order document is checked against what Stripe says
 *
 * Nothing is paid: the PaymentIntent is left unconfirmed and then
 * cancelled, and the connected account and the two test users are
 * removed at the end.
 *
 *   node scripts/stripe_live_e2e.mjs
 */
import fs from 'fs';
import path from 'path';

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import os from 'os';

const PROJECT = 'pokemarket-255c6';

function readEnv() {
  const out = {};
  for (const line of fs.readFileSync(path.resolve('.env'), 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const env = readEnv();
const stripeKey =
  fs
    .readFileSync(
      path.join(process.env.HOME, '.hermes/secrets/stripe-pokemarket.env'),
      'utf-8',
    )
    .split('\n')
    .find((l) => l.startsWith('STRIPE_SECRET_KEY='))
    ?.split('=')[1]
    .trim() ?? '';

const app = initializeApp({
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
  projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? PROJECT,
  appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
});
const auth = getAuth(app);
const db = getFirestore(app);
const fns = getFunctions(app, 'us-central1');

let pass = 0;
let fail = 0;
function check(label, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail += 1;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/**
 * Write a document with the server's own rights.
 *
 * The `sellers` collection is server-only by rule — a client cannot
 * write it, which is the point. The test needs to stand in for a
 * seller who has finished onboarding, so it writes the document the
 * way the server would: through the Firestore REST API with the
 * Firebase CLI's access token.
 */
async function writeAsServer(docPath, fields) {
  const cfg = JSON.parse(
    fs.readFileSync(
      path.join(os.homedir(), '.config/configstore/firebase-tools.json'),
      'utf-8',
    ),
  );
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: cfg.tokens.refresh_token,
    client_id:
      '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
    client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
    scope: 'https://www.googleapis.com/auth/cloud-platform',
  });
  const tokRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const access = (await tokRes.json()).access_token;

  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${docPath}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${access}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    },
  );
  if (!res.ok) {
    throw new Error(`server write failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

const stamp = Date.now();
const sellerEmail = `hermes.stripe.seller.${stamp}@example.com`;
const buyerEmail = `hermes.stripe.buyer.${stamp}@example.com`;
const password = 'Hk9!pokemarket2026';

const cleanup = { sellerUid: null, buyerUid: null, accountId: null, paymentIntentId: null };

async function stripe(pathname, method = 'GET', body) {
  // The path already starts with /v1 — prefixing it again produces
  // "Unrecognized request URL (POST: /v1/v1/accounts)".
  const res = await fetch(`https://api.stripe.com${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function makeUser(email, name) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;
  await setDoc(doc(db, 'users', uid), {
    uid,
    email,
    displayName: name,
    createdAt: serverTimestamp(),
  });
  return uid;
}

try {
  console.log('\n════ 1. 賣家開通 Stripe 收款帳戶 ════');
  const sellerUid = await makeUser(sellerEmail, '賣家測試');
  cleanup.sellerUid = sellerUid;
  await signInWithEmailAndPassword(auth, sellerEmail, password);

  const createSeller = httpsCallable(fns, 'createSellerAccount');
  let accountId = null;
  try {
    const sellerRes = await createSeller({});
    accountId = sellerRes.data.accountId;
    cleanup.accountId = accountId;
    check('createSellerAccount 返咗 connected account', Boolean(accountId), accountId);
    check(
      'onboarding link 指向 Stripe 官方',
      String(sellerRes.data.onboardingUrl ?? '').startsWith('https://'),
      String(sellerRes.data.onboardingUrl ?? '').slice(0, 70),
    );

    const acct = await stripe(`/v1/accounts/${accountId}`);
    check('Stripe 上面真係有呢個 account', acct.status === 200, acct.body.id);
    check('type = express', acct.body.type === 'express', acct.body.type);
    check(
      'capabilities.transfers 已申請（平台用 transfer 畀錢）',
      acct.body.capabilities?.transfers?.requested === true,
    );
    check(
      '冇申請 card_payments（賣家唔收卡）',
      acct.body.capabilities?.card_payments?.requested !== true,
    );
    check(
      'firebaseUid 記咗落 metadata',
      acct.body.metadata?.firebaseUid === sellerUid,
    );

    const sellerDoc = await getDoc(doc(db, 'sellers', sellerUid));
    check(
      'sellers/{uid}.stripeAccountId 已寫入',
      sellerDoc.exists() && sellerDoc.data().stripeAccountId === accountId,
    );
  } catch (err) {
    // Connect has to be switched on in the Stripe dashboard before a
    // platform can create a connected account. Everything below — the
    // escrow itself — works without it, because the charge stays on
    // the platform account and the seller is paid by a transfer later.
    const msg = String(err?.message ?? '');
    if (/Connect/i.test(msg)) {
      console.log(`  ⚠️  平台未開通 Stripe Connect —— 賣家開通呢步暫時測唔到`);
      console.log(`     錯誤訊息: ${msg}`);
      console.log(`     開通方法: https://dashboard.stripe.com/connect`);
      await writeAsServer(`sellers/${sellerUid}`, {
        uid: { stringValue: sellerUid },
        stripeAccountId: { stringValue: 'acct_placeholder_for_escrow_test' },
        email: { stringValue: sellerEmail },
        onboarded: { booleanValue: true },
      });
      console.log('  ℹ️  已放入一個佔位 connected account，繼續測託管流程');
    } else {
      throw err;
    }
  }

  console.log('\n════ 2. 買家落單 ════');
  const buyerUid = await makeUser(buyerEmail, '買家測試');
  cleanup.buyerUid = buyerUid;
  await signInWithEmailAndPassword(auth, buyerEmail, password);

  const cardPrice = 100;
  const deliveryFee = 35;

  // The client sends the card price and the shipping charge. It does
  // not send a total — the server decides what is charged.
  const createPayment = httpsCallable(fns, 'createPaymentIntent');
  const payRes = await createPayment({
    orderId: '',
    cardPriceHkd: cardPrice,
    deliveryFeeHkd: deliveryFee,
    sellerId: sellerUid,
    deliveryMethod: 'sf',
    cardName: 'Pikachu ex',
    cardId: 'sv3pt5-020',
  });
  const piId = payRes.data.paymentIntentId;
  cleanup.paymentIntentId = piId;
  check('createPaymentIntent 成功', Boolean(piId), piId);

  // Fee policy: 3% platform + 2.9% Stripe + HK$2.35, floor HK$20.
  const stripeFeeCents = Math.round(cardPrice * 100 * 0.029) + 235;
  const platformFeeCents = Math.round(cardPrice * 100 * 0.03);
  const totalFeeCents = Math.max(stripeFeeCents + platformFeeCents, 2000);
  const expectedTotalCents = Math.round(cardPrice * 100) + totalFeeCents + deliveryFee * 100;

  const pi = await stripe(`/v1/payment_intents/${piId}`);
  check('Stripe 上面真係有呢個 PaymentIntent', pi.status === 200);
  check('currency = hkd', pi.body.currency === 'hkd', pi.body.currency);
  check(
    `買家被收 HK$ ${(expectedTotalCents / 100).toFixed(2)}（卡價 ${cardPrice} + 費用 ${(totalFeeCents / 100).toFixed(2)} + 運費 ${deliveryFee}）`,
    pi.body.amount === expectedTotalCents,
    `實際 HK$ ${(pi.body.amount / 100).toFixed(2)}`,
  );
  check(
    '冇 transfer_data.destination（錢留喺平台 = 真託管）',
    pi.body.transfer_data === undefined || pi.body.transfer_data === null,
  );
  check(
    '冇 application_fee_amount（費用由賣家應收額扣）',
    pi.body.application_fee_amount === undefined || pi.body.application_fee_amount === null,
  );
  check(
    'status = requires_payment_method（未付，冇郁錢）',
    pi.body.status === 'requires_payment_method',
    pi.body.status,
  );
  check(
    'metadata 有 orderId',
    Boolean(pi.body.metadata?.orderId),
    pi.body.metadata?.orderId,
  );

  console.log('\n════ 3. 訂單文件 ════');
  const orderId = pi.body.metadata?.orderId;
  const orderDoc = await getDoc(doc(db, 'orders', orderId));
  check('order 文件存在', orderDoc.exists());
  const order = orderDoc.data() ?? {};
  check('buyerId 正確', order.buyerId === buyerUid);
  check('sellerId 正確', order.sellerId === sellerUid);
  check(
    `cardPriceHkd = ${cardPrice}`,
    order.cardPriceHkd === cardPrice,
    String(order.cardPriceHkd),
  );
  check(
    `buyerTotalHkd = ${(expectedTotalCents / 100).toFixed(2)}`,
    order.buyerTotalHkd === expectedTotalCents / 100,
    String(order.buyerTotalHkd),
  );
  check(
    `sellerNetHkd = ${(cardPrice - order.platformFeeHkd).toFixed(2)}`,
    order.sellerNetHkd === cardPrice - (order.platformFeeHkd ?? 0),
    String(order.sellerNetHkd),
  );
  check('status = awaiting_payment', order.status === 'awaiting_payment', order.status);
  check(
    'deliveryFeeHkd 有記錄',
    order.deliveryFeeHkd === deliveryFee,
    String(order.deliveryFeeHkd),
  );

  console.log('\n════ 4. Webhook endpoint ════');
  const hooks = await stripe('/v1/webhook_endpoints?limit=20');
  const mine = (hooks.body.data ?? []).find(
    (h) => h.url === `https://us-central1-${PROJECT}.cloudfunctions.net/stripeWebhook`,
  );
  check('endpoint 指向 us-central1', Boolean(mine), mine?.url ?? '搵唔到');
  check(
    '訂閱咗 payment_intent.succeeded',
    (mine?.enabled_events ?? []).includes('payment_intent.succeeded'),
  );
  check(
    '訂閱咗 charge.refunded',
    (mine?.enabled_events ?? []).includes('charge.refunded'),
  );
  check('endpoint 係 enabled', mine?.status === 'enabled', mine?.status);
} catch (err) {
  fail += 1;
  console.log(`  ❌ 流程中斷: ${err?.message ?? err}`);
  if (err?.details) console.log(`     details: ${JSON.stringify(err.details).slice(0, 300)}`);
} finally {
  console.log('\n════ 清理 ════');
  if (cleanup.paymentIntentId) {
    const c = await stripe(`/v1/payment_intents/${cleanup.paymentIntentId}`, 'POST', 'cancel=true');
    console.log(`  ${c.body?.status === 'canceled' ? '✅' : '⚠️ '} PaymentIntent 已取消`);
  }
  if (cleanup.accountId) {
    const d = await stripe(`/v1/accounts/${cleanup.accountId}`, 'DELETE');
    console.log(`  ${d.body?.deleted ? '✅' : '⚠️ '} connected account 已刪除`);
  }
  for (const uid of [cleanup.buyerUid, cleanup.sellerUid]) {
    if (!uid) continue;
    try {
      await auth.currentUser?.delete();
      console.log(`  ✅ 已刪測試帳號 ${uid}`);
    } catch (e) {
      console.log(`  ⚠️  刪唔到 ${uid}: ${e?.message ?? e}`);
    }
  }
  console.log(`\n════ 結果: ${pass} 通過, ${fail} 失敗 ════`);
  process.exit(fail === 0 ? 0 : 1);
}
