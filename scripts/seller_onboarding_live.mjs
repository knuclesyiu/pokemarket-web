#!/usr/bin/env node
/**
 * Does a seller get a payout account, end to end, on the live project?
 *
 * Connect being switched on in the dashboard is a claim; the only
 * proof is that the app's own callable creates a connected account and
 * hands the seller a link. This drives the real callable as a real
 * signed-in seller, then checks what Stripe actually holds.
 *
 * The seller cannot finish Stripe's hosted onboarding here — that
 * needs a human's identity documents and a bank account — so the test
 * stops where a human would take over.
 *
 *   node scripts/seller_onboarding_live.mjs
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

const env = {};
for (const line of fs.readFileSync('.env', 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
const secrets = {};
for (const line of
  fs.readFileSync(path.join(os.homedir(), '.hermes/secrets/stripe-pokemarket.env'), 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) secrets[m[1]] = m[2].trim();
}

let pass = 0;
let fail = 0;
const check = (ok, label, extra = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const app = initializeApp({
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
  projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
});
const auth = getAuth(app);
const db = getFirestore(app);
const fns = getFunctions(app, 'us-central1');

const email = `hermes.seller.${Date.now()}@example.com`;
const password = 'Hk9!pokemarket2026';

console.log('  ═══ 1. 賣家帳戶 ═══');
try {
  await createUserWithEmailAndPassword(auth, email, password);
} catch (e) {
  if (!String(e.code).includes('email-already-in-use')) throw e;
  await signInWithEmailAndPassword(auth, email, password);
}
const uid = auth.currentUser.uid;
check(!!uid, '賣家已登入', `uid=${uid}`);
await setDoc(doc(db, 'users', uid), {
  uid, email, displayName: 'E2E 賣家', phone: '91234567',
  createdAt: serverTimestamp(),
});
check(true, 'profile 已寫入');

console.log('\n  ═══ 2. createSellerAccount（真係經 live function）═══');
let accountId = null;
let onboardingUrl = null;
try {
  const call = httpsCallable(fns, 'createSellerAccount');
  const res = await call({ email });
  accountId = res.data?.accountId;
  onboardingUrl = res.data?.onboardingUrl;
  check(!!accountId, '取得 accountId', accountId ?? '(none)');
  check(!!onboardingUrl, '取得 onboardingUrl');
  if (onboardingUrl) {
    const r = await fetch(onboardingUrl, { redirect: 'manual' });
    console.log(`     onboarding link → HTTP ${r.status} ${r.status === 302 || r.status === 301 ? '(redirect 到 Stripe)' : ''}`);
  }
} catch (e) {
  check(false, 'createSellerAccount 失敗', String(e.message).slice(0, 200));
}

console.log('\n  ═══ 3. Stripe 實際上收咗咩 ═══');
const stripe = async (p) => {
  const r = await fetch('https://api.stripe.com/v1' + p, {
    headers: { Authorization: 'Bearer ' + secrets.STRIPE_SECRET_KEY },
  });
  return { status: r.status, body: await r.json() };
};
if (accountId) {
  const { status, body } = await stripe(`/accounts/${accountId}`);
  check(status === 200, 'connected account 存在', body.id ?? '');
  check(body.type === 'express', 'type = express', body.type);
  check(body.country === 'HK', 'country = HK', body.country);
  check(body.capabilities?.transfers === 'requested' || body.capabilities?.transfers === 'active',
    'transfers capability 已請求', body.capabilities?.transfers);
  check(body.details_submitted === false, '仲未交個人資料（正常，要賣家自己填）');
  check(body.email === email, 'email 正確');
  const { body: accs } = await stripe('/accounts?limit=10');
  check((accs.data || []).some((a) => a.id === accountId), 'GET /v1/accounts 見到佢');
}

console.log('\n  ═══ 4. getSellerOnboardingStatus ═══');
try {
  const call = httpsCallable(fns, 'getSellerOnboardingStatus');
  const res = await call({});
  check(res.data?.onboarded === false, 'onboarded = false（未填資料）');
  check(res.data?.stripeConfigured === true, 'stripeConfigured = true');
  check(res.data?.accountId === accountId, 'accountId 同上面一致');
} catch (e) {
  check(false, 'getSellerOnboardingStatus 失敗', String(e.message).slice(0, 160));
}

console.log('\n  ═══ 5. Tax 狀態 ═══');
{
  const { body: settings } = await stripe('/tax/settings');
  console.log(`     tax/settings status = ${settings.status}  automatic_tax = ${settings.automatic_tax?.enabled ?? 'n/a'}`);
  const { status: ls, body: locs } = await stripe('/tax/locations?type=country');
  if (ls === 200) {
    const list = locs.data || [];
    console.log(`     tax locations = ${list.length}`);
    for (const l of list) console.log(`       - ${l.country} (${l.type}) active=${l.active}`);
    check(true, '讀到 tax locations');
  } else {
    console.log(`     tax/locations → HTTP ${ls} ${JSON.stringify(locs.error?.message || '').slice(0, 100)}`);
  }
  const { body: acct } = await stripe('/account');
  const caps = acct.capabilities || {};
  console.log('     平台 capabilities: ' + Object.entries(caps).map(([k, v]) => `${k}=${v.status}`).join('  '));
  const req = acct.requirements || {};
  const due = req.currently_due || [];
  check(due.length === 0, '平台冇未完成要求', due.join(', '));
}

console.log('\n  ═══ 清理 ═══');
if (accountId) {
  const r = await fetch(`https://api.stripe.com/v1/accounts/${accountId}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + secrets.STRIPE_SECRET_KEY },
  });
  check(r.ok || r.status === 404, 'connected account 已刪', `HTTP ${r.status}`);
}
await auth.currentUser.delete();
console.log('  🧹 測試帳號已刪');

console.log(`\n  ═══ 結果: ${pass} 通過, ${fail} 失敗 ═══`);
process.exit(fail ? 1 : 0);
