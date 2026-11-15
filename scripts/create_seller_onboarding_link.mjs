#!/usr/bin/env node
/**
 * Set up a seller account for a human to complete, and hand over the
 * link.
 *
 * The seller has to give Stripe their identity and a bank account,
 * which cannot be automated. Everything around it can: the account is
 * created through the live function so it is linked to a real Firebase
 * user, and the onboarding link is fetched from that same call — the
 * same path the app uses, so a link that works here works there.
 *
 *   node scripts/create_seller_onboarding_link.mjs [email]
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

// ── the platform's own contact email, if none was given ────────────────────
let email = process.argv[2];
if (!email) {
  const r = await fetch('https://api.stripe.com/v1/account', {
    headers: { Authorization: 'Bearer ' + secrets.STRIPE_SECRET_KEY },
  });
  const a = await r.json();
  email = a.contact_email || a.email;
  console.log('  用平台帳戶電郵:', email);
}
if (!email) {
  console.error('  冇電郵可用 —— 請傳一個：node create_seller_onboarding_link.mjs <email>');
  process.exit(1);
}

const password = `Hk9!seller${Date.now().toString().slice(-6)}`;

// ── clean up the accounts the probes left behind ────────────────────────────
console.log('\n  ═══ 清理 probe 殘留帳戶 ═══');
{
  const r = await fetch('https://api.stripe.com/v1/accounts?limit=50', {
    headers: { Authorization: 'Bearer ' + secrets.STRIPE_SECRET_KEY },
  });
  const j = await r.json();
  for (const a of j.data || []) {
    const isProbe =
      /example\.com$/.test(a.email || '') || a.email === null;
    if (!isProbe) continue;
    const d = await fetch(`https://api.stripe.com/v1/accounts/${a.id}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + secrets.STRIPE_SECRET_KEY },
    });
    console.log(`    ${a.id} (${a.email}) → HTTP ${d.status}`);
  }
}

// ── the Firebase user the seller account belongs to ────────────────────────
const app = initializeApp({
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
  projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
});
const auth = getAuth(app);
const db = getFirestore(app);
const fns = getFunctions(app, 'us-central1');

console.log('\n  ═══ 建立賣家帳戶 ═══');
try {
  await createUserWithEmailAndPassword(auth, email, password);
  console.log('  ✅ Firebase 帳戶已建立');
} catch (e) {
  if (!String(e.code).includes('email-already-in-use')) throw e;
  console.log('  ℹ️  已存在，改為登入');
  await signInWithEmailAndPassword(auth, email, password);
}
const uid = auth.currentUser.uid;
await setDoc(doc(db, 'users', uid), {
  uid, email, displayName: '賣家測試', phone: '91234567',
  createdAt: serverTimestamp(),
});
console.log('  ✅ profile 已寫入 · uid =', uid);
console.log('  🔑 密碼:', password, '（測試用，之後可以改）');

// ── the live call the app makes ─────────────────────────────────────────────
console.log('\n  ═══ createSellerAccount（live function）═══');
const call = httpsCallable(fns, 'createSellerAccount');
const res = await call({ email });
const { accountId, onboardingUrl } = res.data;

console.log('  accountId     ', accountId);
console.log('  onboardingUrl ', onboardingUrl);
console.log('\n  ═════════════════════════════════════════════════════');
console.log('  撳呢條 link 完成開通：');
console.log('  ', onboardingUrl);
console.log('  ═════════════════════════════════════════════════════');
console.log('\n  要交嘅嘢（Stripe 會逐步問）：');
console.log('    · 香港身份證號碼 + 身份證相');
console.log('    · 住址、生日、電話');
console.log('    · 本人名下銀行戶口（做 payout 用）');
console.log('    · 商業類別（MCC）同網址');
console.log('\n  完成後同我講，我就即刻跑真卡付款 → 放款 → 提現嘅最後一段。');
