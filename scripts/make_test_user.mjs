/**
 * Create a test user with a profile, without going through the UI.
 *
 * The app's own registration form is a controlled React Native Web
 * form, and filling it from a browser harness does not always fire
 * the change events the input needs. Creating the account through the
 * client SDK and then signing in through the UI gets to the same
 * place with less fighting.
 *
 *   node scripts/make_test_user.mjs <email> <password> [displayName]
 */
import fs from 'fs';

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';

const env = {};
for (const line of fs.readFileSync('.env', 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const app = initializeApp({
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
  projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
});
const auth = getAuth(app);
const db = getFirestore(app);

const email = process.argv[2];
const password = process.argv[3];
const displayName = process.argv[4] ?? 'UI 檢查';

if (!email || !password) {
  console.error('usage: node scripts/make_test_user.mjs <email> <password> [name]');
  process.exit(1);
}

try {
  await createUserWithEmailAndPassword(auth, email, password);
  console.log(`  ✅ 已建立 ${email}`);
} catch (e) {
  if (!String(e.code).includes('email-already-in-use')) throw e;
  console.log(`  ℹ️  ${email} 已存在，改为登入`);
  await signInWithEmailAndPassword(auth, email, password);
}

const uid = auth.currentUser?.uid;
if (!uid) {
  console.error('  no current user');
  process.exit(1);
}

// `--delete` removes the account instead of creating one. A browser
// test on the live project leaves a real user behind, and the next
// test inherits it.
if (process.argv.includes('--delete')) {
  await auth.currentUser.delete();
  console.log(`  🧹 已刪測試帳號 ${email}`);
  process.exit(0);
}
await setDoc(doc(db, 'users', uid), {
  uid,
  email,
  displayName,
  phone: '91234567',
  createdAt: serverTimestamp(),
});
console.log(`  ✅ profile 已寫入 · uid = ${uid}`);
