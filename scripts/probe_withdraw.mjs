/**
 * Call the emulator's withdrawal function and print what the server
 * says. Used to confirm the server refuses a withdrawal that Stripe
 * cannot carry out, with a message that names the problem.
 *
 *   node scripts/probe_withdraw.mjs <email> <password> [amountHkd]
 */
import fs from 'fs';
import path from 'path';

import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';

function readEnv() {
  const out = {};
  for (const line of fs.readFileSync(path.resolve('.env'), 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const env = readEnv();
const [, , email, password, amountArg] = process.argv;
const amount = Number(amountArg ?? 120);

const app = initializeApp({
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
  projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
});
const auth = getAuth(app);
const functions = getFunctions(app, 'us-central1');

await connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
await connectFunctionsEmulator(functions, '127.0.0.1', 5001);

await signInWithEmailAndPassword(auth, email, password);

const withdraw = httpsCallable(functions, 'createWithdrawal');
try {
  const res = await withdraw({
    amountHkd: amount,
    sellerStripeAccountId: 'acct_emulator_1',
  });
  console.log('  ✅ 成功:', JSON.stringify(res.data));
} catch (e) {
  console.log(`  錯誤 code: ${e.code}`);
  console.log(`  錯誤訊息: ${e.message}`);
  const details = e.details;
  if (details) console.log(`  details: ${JSON.stringify(details).slice(0, 300)}`);
}
process.exit(0);
