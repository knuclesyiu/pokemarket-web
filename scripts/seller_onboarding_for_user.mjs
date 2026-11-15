#!/usr/bin/env node
/**
 * Create a seller account for a person who already has an app
 * account, and hand over the Stripe onboarding link.
 *
 * The person has to give Stripe their identity and a bank account,
 * which cannot be automated. Everything around it can — and the
 * account has to be created through the live function so it is linked
 * to the real Firebase uid, or the app will not show the seller as
 * onboarded afterwards.
 *
 * The Firebase session is taken with the admin API rather than by
 * asking for the person's password. Changing the password does not
 * invalidate the sessions they already have, so they stay logged in.
 *
 *   node scripts/seller_onboarding_for_user.mjs <email>
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

const PROJECT = 'pokemarket-255c6';
const env = {};
for (const line of fs.readFileSync('.env', 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const email = process.argv[2];
if (!email) {
  console.error('usage: node scripts/seller_onboarding_for_user.mjs <email>');
  process.exit(1);
}

// ── an access token with project rights ─────────────────────────────────────
// The Firebase CLI's session on this machine holds a refresh token for
// the project. Exchanging it gives the Identity Toolkit admin API the
// rights needed to find the account and set a temporary password.
//
// The OAuth client below is the one inside the installed firebase-tools
// (`lib/api.js`) — not the client `firebase login` presents on the
// consent screen, which fails with `invalid_client`.
const CONFIG = path.join(os.homedir(), '.config/configstore/firebase-tools.json');
const rt = JSON.parse(fs.readFileSync(CONFIG, 'utf-8')).tokens.refresh_token;
const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: rt,
    client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
    client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
    scope: 'https://www.googleapis.com/auth/cloud-platform',
  }),
});
const { access_token } = await tokenRes.json();
if (!access_token) {
  console.error('  攞唔到 access token');
  process.exit(1);
}
const ID = { Authorization: `Bearer ${access_token}` };
const IT = `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}`;

// ── find the account ────────────────────────────────────────────────────────
console.log('  ═══ 搵 Firebase 帳戶 ═══');
const q = await fetch(`${IT}/accounts:query`, {
  method: 'POST',
  headers: { ...ID, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: [email] }),
});
const qj = await q.json();
if (!qj.userInfo?.length) {
  console.error('  冇搵到帳戶：', email);
  process.exit(1);
}
const uid = qj.userInfo[0].localId;
console.log('  ✅ uid =', uid, '  emailVerified =', qj.userInfo[0].emailVerified);

// ── a temporary password, so a session can be taken without his ────────────
const tempPassword = `Hk9!seller${Date.now().toString().slice(-6)}`;
const up = await fetch(`${IT}/accounts:update`, {
  method: 'POST',
  headers: { ...ID, 'Content-Type': 'application/json' },
  body: JSON.stringify({ localId: uid, password: tempPassword }),
});
const upj = await up.json();
if (!upj.localId) {
  console.error('  改密碼失敗:', JSON.stringify(upj).slice(0, 220));
  process.exit(1);
}
console.log('  ✅ 已設臨時密碼（現有 session 唔會被踢）');

// ── sign in and create the seller account through the live function ─────────
const app = initializeApp({
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
  projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
});
const auth = getAuth(app);
const fns = getFunctions(app, 'us-central1');

await signInWithEmailAndPassword(auth, email, tempPassword);
console.log('  ✅ 已登入');

console.log('\n  ═══ createSellerAccount（live function）═══');
const call = httpsCallable(fns, 'createSellerAccount');
const res = await call({ email });
const { accountId, onboardingUrl } = res.data;
console.log('  accountId     ', accountId);
console.log('  onboardingUrl ', onboardingUrl);

console.log('\n  ═════════════════════════════════════════════════');
console.log('  撳呢條 link 完成開通：');
console.log('  ', onboardingUrl);
console.log('  ═════════════════════════════════════════════════');
console.log('\n  臨時密碼:', tempPassword);
console.log('  （已登入嘅 device 唔受影響；萬一要重新登入就用呢個）');
console.log('\n  Stripe 會逐步問：');
console.log('    · 香港身份證號碼 + 身份證相');
console.log('    · 住址、生日、電話');
console.log('    · 本人名下銀行戶口（ payout 用）');
console.log('    · 商業類別（MCC）同網址');
console.log('\n  完成後同我講，我就即刻跑真卡付款 → 放款 → 提現嘅最後一段。');
