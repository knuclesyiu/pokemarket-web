/**
 * Raw-HTTP probe for a single live callable.
 *
 * The SDK maps a platform-level 401/403 and a function's own
 * "unauthenticated" error onto the same code, so the only way to tell
 * them apart is to look at the raw response.
 */
import fs from 'fs';
import path from 'path';

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  deleteUser,
} from 'firebase/auth';

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

const FN = process.argv[2] ?? 'syncCardPrices';
const DATA = process.argv[3] ? JSON.parse(process.argv[3]) : {};
const BASE = `https://us-central1-${env.EXPO_PUBLIC_FIREBASE_PROJECT_ID}.cloudfunctions.net`;

const email = `hermes.raw.${Date.now()}@example.com`;
const password = `Rw${Math.random().toString(36).slice(2)}!9`;

await createUserWithEmailAndPassword(auth, email, password);
const token = await auth.currentUser.getIdToken(true);

const res = await fetch(`${BASE}/${FN}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ data: DATA }),
});

const text = await res.text();
console.log(`  ${FN} → HTTP ${res.status}`);
console.log(`  content-type: ${res.headers.get('content-type')}`);
console.log(`  body: ${text.slice(0, 500)}`);

try {
  await deleteUser(auth.currentUser);
  console.log('  臨時帳號已刪');
} catch (e) {
  console.warn('  ⚠️ 清理失敗');
}
