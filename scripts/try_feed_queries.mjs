/**
 * Try candidate home-feed queries against the live collection and
 * show what each one actually puts on screen.
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
const db = getFirestore(app);

const CANDIDATES = [
  {
    label: 'A 現況：limit(50) 冇排序',
    q: query(collection(db, 'card_prices'), limit(8)),
  },
  {
    label: 'B 有價 + 最貴優先',
    q: query(collection(db, 'card_prices'),
      where('priceHkd', '>', 0), orderBy('priceHkd', 'desc'), limit(8)),
  },
  {
    label: 'C 有價 + HK$20–5000 交易帶',
    q: query(collection(db, 'card_prices'),
      where('priceHkd', '>=', 20), where('priceHkd', '<=', 5000),
      orderBy('priceHkd', 'desc'), limit(8)),
  },
  {
    label: 'D 有價 + 最平優先',
    q: query(collection(db, 'card_prices'),
      where('priceHkd', '>', 0), orderBy('priceHkd', 'asc'), limit(8)),
  },
];

for (const c of CANDIDATES) {
  console.log(`\n  ${c.label}`);
  try {
    const snap = await getDocs(c.q);
    if (snap.empty) {
      console.log('    (空)');
      continue;
    }
    snap.forEach((d) => {
      const p = d.data();
      console.log(
        `    ${String(d.id).padEnd(14)} ${String(p.name ?? '').padEnd(20)} ` +
          `HK$${String(p.priceHkd ?? 0).padEnd(10)} ${String(p.set ?? '').slice(0, 26)}`,
      );
    });
  } catch (e) {
    console.log(`    ❌ ${String(e.message).slice(0, 140)}`);
  }
}
