/**
 * Read a sample of the live `card_prices` collection.
 *
 * The app shows card names but every price reads HK$ 0, so the
 * question is whether the collection is empty, or full of documents
 * that carry no price fields.
 */
import fs from 'fs';
import path from 'path';

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
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

const snap = await getDocs(collection(db, 'card_prices'));
console.log(`  card_prices 文件數: ${snap.size}`);

let withPrice = 0;
let withPriceHkd = 0;
const samples = [];
snap.forEach((d) => {
  const data = d.data();
  if (Number(data.priceHkd ?? 0) > 0) withPriceHkd += 1;
  if (Number(data.price ?? 0) > 0 || Number(data.priceEur ?? 0) > 0) withPrice += 1;
  if (samples.length < 5) {
    samples.push({
      id: d.id,
      name: data.name ?? null,
      set: data.set ?? null,
      priceHkd: data.priceHkd ?? '(missing)',
      cardmarketHkd: data.cardmarketHkd ?? '(missing)',
      priceEur: data.priceEur ?? '(missing)',
      source: data.source ?? '(missing)',
      fetchedAt: data.fetchedAt ?? '(missing)',
      imageUrl: data.imageUrl ?? '(missing)',
      keys: Object.keys(data).sort().join(','),
    });
  }
});

console.log(`  有 priceHkd > 0: ${withPriceHkd}`);
console.log(`  有任何 price: ${withPrice}`);
console.log('');
for (const s of samples) {
  console.log(`  ── ${s.id}`);
  console.log(`     name=${s.name} set=${s.set}`);
  console.log(`     priceHkd=${s.priceHkd} cardmarketHkd=${s.cardmarketHkd} priceEur=${s.priceEur}`);
  console.log(`     source=${s.source} fetchedAt=${s.fetchedAt}`);
  console.log(`     imageUrl=${s.imageUrl}`);
  console.log(`     keys=${s.keys}`);
}
