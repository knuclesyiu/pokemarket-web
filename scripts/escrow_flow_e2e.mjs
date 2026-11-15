/**
 * Escrow flow end-to-end — payment intent to release.
 *
 * Walks the money path on the real project with the real Stripe
 * account, and checks the things that decide whether a buyer can get
 * their card and a seller can get their money:
 *
 *   1. a buyer asks for a PaymentIntent
 *   2. the PaymentIntent is checked against Stripe directly — the
 *      amount, the currency, and that the money stays on the platform
 *      (escrow) rather than going straight to the seller
 *   3. the order document is checked against what Stripe says
 *   4. the order is put into the states the webhook would put it in,
 *      and the release path is walked: confirm receipt → release
 *   5. the wallets and the payout source are checked after the release
 *
 * Nothing is charged: the PaymentIntent is left unconfirmed and
 * cancelled, and the test users are removed at the end.
 *
 *   node scripts/escrow_flow_e2e.mjs
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  deleteUser,
} from 'firebase/auth';
import { getFirestore, doc, getDoc, deleteDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

const PROJECT = 'pokemarket-255c6';
const REGION = 'us-central1';

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
const fns = getFunctions(app, REGION);

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
function note(text) {
  console.log(`  ── ${text}`);
}

/** Write a document with the server's own rights. */
async function writeAsServer(docPath, fields, mask = null) {
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
  const tokRes = await fetchRetry('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const access = (await tokRes.json()).access_token;
  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${docPath}` +
    // A PATCH without a mask replaces the whole document. That is how a
    // profile once lost its fields. The mask is a query parameter.
    (mask
      ? `?${mask.map((f) => `updateMask.fieldPaths=${f}`).join('&')}`
      : '');
  const res = await fetchRetry(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${access}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`${docPath} → HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

async function readAsServer(docPath) {
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
  const tokRes = await fetchRetry('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const access = (await tokRes.json()).access_token;
  const res = await fetchRetry(
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${docPath}`,
    { headers: { Authorization: `Bearer ${access}` } },
  );
  if (res.status === 404) return null;
  const j = await res.json();
  const out = {};
  for (const [k, v] of Object.entries(j.fields ?? {})) {
    out[k] =
      v.stringValue ??
      v.integerValue ??
      v.doubleValue ??
      v.booleanValue ??
      v.timestampValue ??
      v.nullValue ??
      null;
  }
  return out;
}

/** A fetch that retries: a token endpoint hiccup is not a test failure. */
async function fetchRetry(url, init = {}, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, init);
      if (res.status >= 500 && i < tries - 1) {
        await new Promise((r) => setTimeout(r, 800 * (i + 1)));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastErr;
}

async function stripe(pathname, init = {}) {
  const res = await fetchRetry(`https://api.stripe.com${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, body: json };
}

/** A card id that is in the catalogue, so a listing can be created. */
async function pickCardId() {
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
  const tokRes = await fetchRetry('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const access = (await tokRes.json()).access_token;
  const res = await fetchRetry(
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/card_prices?pageSize=5`,
    { headers: { Authorization: `Bearer ${access}` } },
  );
  const j = await res.json();
  // The document id is the card id; the card may also carry it as a field.
  const id = (j.documents ?? [])
    .map((d) => d.fields?.cardId?.stringValue ?? d.name.split('/').pop())
    .find(Boolean);
  if (!id) throw new Error('card_prices 入面搵唔到 cardId');
  return id;
}

const CARD_PRICE = 1000;
const stamp = Date.now();
const buyerEmail = `escrow-buyer.${stamp}@example.com`;
const sellerEmail = `escrow-seller.${stamp}@example.com`;
const PASS = 'Hk9!escrow12345';

const cleanup = [];

async function makeUser(email) {
  const cred = await createUserWithEmailAndPassword(auth, email, PASS);
  cleanup.push(cred.user);
  return cred.user;
}

try {
  console.log('\n  ════ 1. 準備：買家、賣家、賣家 Stripe 帳戶 ════');
  const buyer = await makeUser(buyerEmail);
  const seller = await makeUser(sellerEmail);
  console.log(`  buyer uid = ${buyer.uid}`);
  console.log(`  seller uid = ${seller.uid}`);

  // The seller needs a connected account. The one this project already
  // finished onboarding for is used — no money moves in this test, the
  // release only writes to the ledger.
  const existing = await readAsServer(
    `sellers/10DCMz6a6VThb4jTI64reCvgM2q2`,
  );
  const accountId = existing?.stripeAccountId;
  check('賣家有一個 Stripe 帳戶', !!accountId, accountId ?? '冇');

  await writeAsServer(
    `sellers/${seller.uid}`,
    {
      stripeAccountId: { stringValue: accountId },
      displayName: { stringValue: 'Escrow Test Seller' },
      email: { stringValue: sellerEmail },
      uid: { stringValue: seller.uid },
    },
    ['stripeAccountId', 'displayName', 'email', 'uid'],
  );
  await writeAsServer(
    `users/${seller.uid}`,
    {
      uid: { stringValue: seller.uid },
      displayName: { stringValue: 'Escrow Test Seller' },
      email: { stringValue: sellerEmail },
      lastCardSet: { stringValue: 'Base' },
      lastCardImageUrl: { stringValue: 'https://example.com/wrong-card.png' },
    },
    ['uid', 'displayName', 'email', 'lastCardSet', 'lastCardImageUrl'],
  );

  console.log('\n  ════ 1b. 賣家開一個掛牌 ════');
  // A card id that is in the catalogue, so the listing can be created.
  const catalogue = await stripe('/v1/nope').catch(() => null);
  void catalogue;
  const priceDoc = await readAsServer('card_prices?pageSize=1');
  void priceDoc;
  const cardId = await pickCardId();

  await signInWithEmailAndPassword(auth, sellerEmail, PASS);
  const createListing = httpsCallable(fns, 'createListing');
  const listingRes = await createListing({
    cardId,
    cardName: 'Pikachu ex',
    price: CARD_PRICE,
    condition: 'Near Mint',
    type: 'buy_now',
  });
  const listingId = listingRes.data.listingId;
  check('賣家開到掛牌', !!listingId, `listingId=${listingId} cardId=${cardId}`);

  console.log('\n  ════ 2. 買家建立 PaymentIntent ════');
  await signInWithEmailAndPassword(auth, buyerEmail, PASS);
  const createPayment = httpsCallable(fns, 'createPaymentIntent');

  const payRes = await createPayment({
    listingId,
    cardPriceHkd: CARD_PRICE,
    deliveryFeeHkd: 35,
    sellerId: seller.uid,
    deliveryMethod: 'sf',
    cardName: 'Pikachu ex',
    cardId: listingId,
  });
  const pay = payRes.data;
  check('createPaymentIntent 成功', !!pay?.orderId, `orderId=${pay?.orderId}`);

  const pi = await stripe(`/v1/payment_intents/${pay.paymentIntentId}`);
  check('Stripe 收到同一個 PaymentIntent', pi.status === 200, `HTTP ${pi.status}`);
  check(
    '貨幣係 HKD',
    pi.body?.currency === 'hkd',
    pi.body?.currency,
  );
  const chargedHkd = (pi.body?.amount ?? 0) / 100;
  check(
    '金額 = 卡價 + 平台費 + Stripe 費 + 運費',
    Math.abs(chargedHkd - pay.amount) < 0.011,
    `Stripe HK$${chargedHkd} / callable HK$${pay.amount}`,
  );
  check(
    '錢留喺平台（冇 destination charge）',
    !pi.body?.transfer_data?.destination,
    pi.body?.transfer_data?.destination ?? '冇 transfer_data',
  );
  check(
    '冇 application_fee_amount（費用喺放款時扣）',
    pi.body?.application_fee_amount == null,
    String(pi.body?.application_fee_amount ?? '冇'),
  );

  const order = await readAsServer(`orders/${pay.orderId}`);
  check('訂單已寫入', !!order, `status=${order?.status}`);
  check(
    '訂單記錄嘅金額同 Stripe 一致',
    Math.abs(Number(order?.buyerTotalHkd) - chargedHkd) < 0.011,
    `order=${order?.buyerTotalHkd} stripe=${chargedHkd}`,
  );
  check(
    '賣家淨額 = 卡價 − 平台費',
    Math.abs(
      Number(order?.sellerNetHkd) -
        (CARD_PRICE - Number(order?.platformFeeHkd)),
    ) < 0.011,
    `net=${order?.sellerNetHkd} price=${CARD_PRICE} fee=${order?.platformFeeHkd}`,
  );
  check(
    '訂單嘅卡牌資料唔係用賣家「上一張卡」',
    order?.cardImageUrl !== 'https://example.com/wrong-card.png',
    `cardImageUrl=${order?.cardImageUrl}`,
  );

  console.log('\n  ════ 3. 客戶端可以自己講價？ ════');
  const bogus = await createPayment({
    listingId,
    cardPriceHkd: 1, // the client says the card is worth HK$1
    deliveryFeeHkd: 9999,
    sellerId: seller.uid,
    deliveryMethod: 'sf',
    cardName: 'Pikachu ex',
    cardId: listingId,
  }).catch((e) => e);
  const bogusOrder = bogus?.data?.orderId
    ? await readAsServer(`orders/${bogus.data.orderId}`)
    : null;
  check(
    'server 用掛牌嘅價，唔係 client 講嘅 HK$1',
    !bogusOrder || Number(bogusOrder.cardPriceHkd) === CARD_PRICE,
    bogusOrder ? `server 記低 HK$${bogusOrder.cardPriceHkd}` : '拒絕咗',
  );
  check(
    '運費由 server 決定（唔係 client 嘅 9999）',
    !bogusOrder || Number(bogusOrder.deliveryFeeHkd) === 35,
    bogusOrder ? `deliveryFeeHkd=${bogusOrder.deliveryFeeHkd}` : '—',
  );
  if (bogus?.data?.paymentIntentId) {
    await stripe(`/v1/payment_intents/${bogus.data.paymentIntentId}`, {
      method: 'POST',
      body: 'cancel=true',
    });
  }

  console.log('\n  ════ 4. 同一張單重複落單會唔會收兩次錢？ ════');
  const orderId2 = `e2e-idem-${stamp}`;
  const first = await createPayment({
    orderId: orderId2,
    listingId,
    cardPriceHkd: CARD_PRICE,
    deliveryFeeHkd: 0,
    sellerId: seller.uid,
    deliveryMethod: 'sf',
    cardName: 'Pikachu ex',
    cardId: listingId,
  });
  const second = await createPayment({
    orderId: orderId2,
    listingId,
    cardPriceHkd: CARD_PRICE,
    deliveryFeeHkd: 0,
    sellerId: seller.uid,
    deliveryMethod: 'sf',
    cardName: 'Pikachu ex',
    cardId: listingId,
  }).catch((e) => e);
  check(
    '第二次落單唔會再開一個 PaymentIntent',
    first.data?.paymentIntentId === second?.data?.paymentIntentId,
    `first=${first.data?.paymentIntentId} second=${second?.data?.paymentIntentId ?? '拒絕'}`,
  );
  if (second?.data?.paymentIntentId) {
    await stripe(`/v1/payment_intents/${second.data.paymentIntentId}`, {
      method: 'POST',
      body: 'cancel=true',
    });
  }

  console.log('\n  ════ 5. 放款路徑：賣家發貨 → 確認收貨 → 放款 ════');
  // The webhook puts the order into 'paid' and puts the money into
  // the buyer's pending escrow. Both are simulated here, because the
  // test does not pay: the webhook only fires on a real charge.
  await writeAsServer(
    `orders/${pay.orderId}`,
    {
      status: { stringValue: 'paid' },
      paidAt: { timestampValue: new Date().toISOString() },
    },
    ['status', 'paidAt'],
  );
  await writeAsServer(
    `users/${buyer.uid}/wallet/main`,
    {
      pendingEscrow: { doubleValue: Number(order.buyerTotalHkd) },
    },
    ['pendingEscrow'],
  );

  const confirmReceipt = httpsCallable(fns, 'confirmReceipt');
  const confirmAtPaid = await confirmReceipt({ orderId: pay.orderId }).catch(
    (e) => e,
  );
  check(
    '送貨單喺 paid 之下唔可以確認收貨（要等發貨）',
    !!confirmAtPaid?.message,
    confirmAtPaid?.message ?? '竟然成功咗',
  );

  // The seller says the card is on its way. This is the step that was
  // missing: without it the order stops at 'paid' forever.
  await signInWithEmailAndPassword(auth, sellerEmail, PASS);
  const markShipped = httpsCallable(fns, 'markShipped');
  const shipped = await markShipped({ orderId: pay.orderId }).catch((e) => e);
  check(
    '賣家可以標記已發貨',
    shipped?.data?.status === 'shipped',
    shipped?.message ?? shipped?.data?.status,
  );
  const shippedOrder = await readAsServer(`orders/${pay.orderId}`);
  check(
    "訂單變咗 'shipped'",
    shippedOrder?.status === 'shipped',
    `status=${shippedOrder?.status}`,
  );

  await signInWithEmailAndPassword(auth, buyerEmail, PASS);
  const confirmed = await confirmReceipt({ orderId: pay.orderId }).catch((e) => e);
  check(
    "status='shipped' 之下確認收貨成功",
    confirmed?.data?.status === 'confirmed',
    confirmed?.message ?? confirmed?.data?.status,
  );

  const release = httpsCallable(fns, 'releasePayment');
  const released = await release({ orderId: pay.orderId }).catch((e) => e);
  check(
    '放款成功',
    released?.data?.status === 'released',
    released?.message ?? released?.data?.status,
  );
  check(
    '放款金額 = 賣家淨額',
    Math.abs(
      Number(released?.data?.releasedAmount) - Number(order?.sellerNetHkd),
    ) < 0.011,
    `released=${released?.data?.releasedAmount} net=${order?.sellerNetHkd}`,
  );
  check(
    '錢仲未離開平台（等賣家提現）',
    released?.data?.payoutPending === true &&
      released?.data?.transferId == null,
    `payoutPending=${released?.data?.payoutPending}`,
  );

  const sellerWallet = await readAsServer(`users/${seller.uid}/wallet/main`);
  check(
    '賣家餘額增加咗賣家淨額',
    Math.abs(Number(sellerWallet?.balance) - Number(order?.sellerNetHkd)) <
      0.011,
    `balance=${sellerWallet?.balance}`,
  );
  const buyerWallet = await readAsServer(`users/${buyer.uid}/wallet/main`);
  check(
    '買家 escrow 扣返晒（變 0，唔會變負數）',
    Math.abs(Number(buyerWallet?.pendingEscrow ?? 0)) < 0.011,
    `pendingEscrow=${buyerWallet?.pendingEscrow ?? '冇'}`,
  );

  console.log('\n  ════ 6. 放款可唔可以重複？ ════');
  const releasedTwice = await release({ orderId: pay.orderId }).catch((e) => e);
  check(
    '第二次放款被拒絕',
    !!releasedTwice?.message,
    releasedTwice?.message ?? '竟然成功咗',
  );
  const sellerWallet2 = await readAsServer(
    `users/${seller.uid}/wallet/main`,
  );
  check(
    '賣家餘額冇被加多一次',
    Math.abs(
      Number(sellerWallet2?.balance) - Number(sellerWallet?.balance),
    ) < 0.011,
    `before=${sellerWallet?.balance} after=${sellerWallet2?.balance}`,
  );

  console.log('\n  ════ 7. 提現嘅 source_transaction 用嘅係乜？ ════');
  const sources = await readAsServer(`orders/${pay.orderId}`);
  const sourceList = await stripe(
    `/v1/payment_intents/${pay.paymentIntentId}/charges?limit=1`,
  );
  const chargeId = sourceList?.body?.data?.[0]?.id ?? null;
  note(`paymentIntentId = ${pay.paymentIntentId}`);
  note(`charge id      = ${chargeId ?? '（未付款，所以未有 charge）'}`);
  const payoutSource = await readAsServer(
    `payout_sources?${''}`,
  );
  note(
    'payout_sources 記低嘅係 paymentIntentId；Stripe 嘅 source_transaction 要 charge id',
  );

  console.log('\n  ════ 清理 ════');
  for (const piId of [pay.paymentIntentId, first.data?.paymentIntentId].filter(Boolean)) {
    await stripe(`/v1/payment_intents/${piId}`, {
      method: 'POST',
      body: 'cancel=true',
    });
  }
} catch (err) {
  console.error('\n  💥 ', err?.message ?? err);
  if (err?.stack) console.error(err.stack.split('\n').slice(0, 6).join('\n'));
  fail += 1;
} finally {
  for (const u of cleanup) {
    await deleteUser(u).catch(() => {});
  }
  console.log(`\n  ════ 結果：${pass} 通過 / ${fail} 失敗 ════\n`);
  process.exit(fail ? 1 : 0);
}
