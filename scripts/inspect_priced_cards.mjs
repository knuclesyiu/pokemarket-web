/**
 * Look at the cards that actually have a price.
 *
 * The home feed was showing `limit(50)` with no ordering, which
 * Firestore satisfies by document id — so it displayed the lowest
 * ids in the collection (McDonald's Collection 2011 promos, all
 * price 0) instead of the cards that carry a market price.
 */
import fs from 'fs';
import path from 'path';

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';

function readEnv() {
  const file = path.resolve('.env');
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
const db = getFirestore(app);

// The cards worth showing: priced, most valuable first.
const snap = await getDocs(
  query(
    collection(db, 'card_prices'),
    where('priceHkd', '>', 0),
    orderBy('priceHkd', 'desc'),
    limit(12),
  ),
);

console.log('  有價卡（最貴 12 個）:');
snap.forEach((d) => {
  const p = d.data();
  console.log(
    `   ${String(d.id).padEnd(14)} ${String(p.name ?? '').padEnd(22)} ` +
      `HK$${String(p.priceHkd).padEnd(8)} set=${String(p.set ?? '').slice(0, 26).padEnd(26)} ` +
      `img=${p.imageUrl ? 'yes' : 'NO'} src=${p.source ?? '?'}`,
  );
});

// How widespread is the missing image?
let noImage = 0;
let total = 0;
const all = await getDocs(query(collection(db, 'card_prices'), limit(400)));
all.forEach((d) => {
  total += 1;
  if (!d.data().imageUrl) noImage += 1;
});
console.log(`\n  抽樣 ${total} 個：${noImage} 個冇 imageUrl`);
