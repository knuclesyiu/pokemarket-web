/**
 * Index the whole card catalogue, then refresh its prices.
 *
 * The name index is backfilled with a cursor, a page at a time, and
 * the server allows one pass per minute. This loop keeps calling
 * until the collection is covered.
 *
 *   node scripts/backfill_card_index.mjs [passes] [cardsPerPass]
 */
import fs from 'fs';
import path from 'path';

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  deleteUser,
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

const passes = Number(process.argv[2] ?? 6);
const cardsPerPass = Number(process.argv[3] ?? 0);

const email = `hermes.index.${Date.now()}@example.com`;
const password = `Ix${Math.random().toString(36).slice(2)}!9`;

await createUserWithEmailAndPassword(auth, email, password);
await auth.currentUser.getIdToken(true);
await new Promise((r) => setTimeout(r, 1500));

const sync = httpsCallable(functions, 'syncCardPrices', { timeout: 540000 });

try {
  for (let i = 1; i <= passes; i += 1) {
    const started = Date.now();
    try {
      const res = await sync({ cardLimit: cardsPerPass, nameBackfillLimit: 20000 });
      const d = res.data;
      console.log(
        `  pass ${i}: namesIndexed=${d.namesIndexed} refreshed=${d.refreshed} ` +
          `skipped=${d.refreshSkipped} (${Math.round((Date.now() - started) / 1000)}s)`,
      );
    } catch (e) {
      console.log(`  pass ${i}: ❌ ${String(e.message ?? e).slice(0, 120)}`);
    }
    if (i < passes) await new Promise((r) => setTimeout(r, 65000));
  }
} finally {
  try {
    if (auth.currentUser) {
      await deleteUser(auth.currentUser);
      console.log('  臨時帳號已刪');
    }
  } catch (e) {
    console.warn('  ⚠️ 臨時帳號清理失敗');
  }
}
