/**
 * Trigger the live price sync.
 *
 * The sync needs a signed-in caller, so this signs up a throwaway
 * account, runs the sync, and deletes the account again.
 *
 *   node scripts/trigger_price_sync.mjs [cardLimit] [nameBackfillLimit]
 */
import fs from 'fs';
import path from 'path';

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  deleteUser,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

function readEnv() {
  const out = {};
  for (const line of fs.readFileSync(path.resolve('.env'), 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const env = readEnv();
const app = initializeApp({
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
});

const auth = getAuth(app);
const functions = getFunctions(app, 'us-central1');

const cardLimit = Number(process.argv[2] ?? 200);
const nameBackfillLimit = Number(process.argv[3] ?? 20000);

const email = `hermes.sync.${Date.now()}@example.com`;
const password = `Sy${Math.random().toString(36).slice(2)}!9`;

try {
  await createUserWithEmailAndPassword(auth, email, password);
  console.log(`  臨時帳號 ${email}`);

  // A freshly created account has no ID token attached yet, and the
  // callable would be rejected as unauthenticated. Force one and give
  // the functions instance a moment to pick it up.
  await auth.currentUser.getIdToken(true);
  await new Promise((r) => setTimeout(r, 1500));

  const sync = httpsCallable(functions, 'syncCardPrices', { timeout: 540000 });
  const started = Date.now();
  const res = await sync({ cardLimit, nameBackfillLimit });
  const seconds = Math.round((Date.now() - started) / 1000);

  console.log(`  用時 ${seconds}s`);
  console.log(`  刷新卡片: ${res.data.refreshed}`);
  console.log(`  有價: ${res.data.withPrice}   無價: ${res.data.withoutPrice}`);
  console.log(`  nameLower 補上: ${res.data.namesIndexed}`);
  console.log(`  失敗: ${res.data.failed}`);
  console.log(`  FX: EUR→HKD ${res.data.fx?.eurToHkd}`);
} finally {
  try {
    if (auth.currentUser) {
      await deleteUser(auth.currentUser);
      console.log('  臨時帳號已刪');
    }
  } catch (e) {
    console.warn('  ⚠️ 臨時帳號清理失敗:', String(e).slice(0, 120));
  }
}
