/**
 * Delete a test account from the live project.
 *
 * The browser check registered a real user, so it has to go. The
 * client SDK can delete its own account, which is all that is needed.
 *
 *   node scripts/delete_test_user.mjs <email> <password>
 */
import fs from 'fs';
import path from 'path';

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  deleteUser,
} from 'firebase/auth';

const [, , EMAIL, PASSWORD] = process.argv;

if (!EMAIL || !PASSWORD) {
  console.error('usage: node scripts/delete_test_user.mjs <email> <password>');
  process.exit(1);
}

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

const app = initializeApp({
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
});

const auth = getAuth(app);
await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);
const uid = auth.currentUser.uid;
await deleteUser(auth.currentUser);
console.log(`  ✅ 已刪除 ${EMAIL} (uid ${uid})`);
