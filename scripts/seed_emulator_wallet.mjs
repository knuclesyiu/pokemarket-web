/**
 * Give the emulator's test user a wallet balance and a Stripe
 * account, so the withdrawal screen can be exercised the way a seller
 * with money in it would see it.
 *
 * The Firestore rules keep the wallet server-only, which is right —
 * so the emulator's own Admin SDK is used here, the same way the
 * server would.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8081 \
 *   node scripts/seed_emulator_wallet.mjs <uid> <amountHkd>
 */
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
const admin = require(
  path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    '../functions/node_modules/firebase-admin'
  )
);

const uid = process.argv[2];
const amount = Number(process.argv[3] ?? 500);

if (!uid) {
  console.error('usage: node scripts/seed_emulator_wallet.mjs <uid> [amountHkd]');
  process.exit(1);
}

admin.initializeApp({ projectId: 'pokemarket-255c6' });
const db = admin.firestore();

await db.doc(`users/${uid}/wallet/main`).set(
  {
    balance: amount,
    pendingEscrow: 0,
    onboardingComplete: true,
  },
  { merge: true },
);

// A seller record, as createSellerAccount would have written it.
await db.doc(`sellers/${uid}`).set(
  {
    uid,
    stripeAccountId: 'acct_emulator_1',
    onboarded: true,
    detailsSubmitted: true,
    payoutsEnabled: true,
  },
  { merge: true },
);

console.log(`  ✅ emulator 餘額 HK$ ${amount} + 收款帳戶已就緒 (uid ${uid})`);
