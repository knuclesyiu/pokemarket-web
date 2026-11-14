/**
 * Check the curated popular-card list against the live `card_prices`.
 *
 * The home feed could either show the most expensive cards in the
 * collection (trophy cards nobody trades) or a curated list of
 * liquid HK-market cards. This says which curated cards actually
 * carry a price, so the choice is made on data.
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
  documentId,
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

// The ids from src/services/priceScraper/popular_cards.py
const POPULAR = [
  'swsh5-115', 'swsh12-71', 'swsh8-115', 'swsh4-116', 'swsh12-215',
  'swsh3-76', 'swsh2-239', 'swsh9-138', 'swsh9-132', 'swsh11-122',
  'swsh11-221', 'swsh21-143', 'swsh8-44', 'swsh2-143', 'sm115-68',
  'sm51-23', 'sm65-86', 'sm51-57', 'sm78-94', 'swsh12-UV',
  'swsh12-espeon', 'swsh5-SV', 'swsh12-SV', 'base4-4', 'base4-2',
  'base4-15', 'base4-shadowless', 'psa10-charizard', 'psa9-mewtwo',
];

const found = [];
for (let i = 0; i < POPULAR.length; i += 30) {
  const chunk = POPULAR.slice(i, i + 30);
  const snap = await getDocs(
    query(collection(db, 'card_prices'), where(documentId(), 'in', chunk)),
  );
  snap.forEach((d) => found.push({ id: d.id, ...d.data() }));
}

console.log(`  熱門卡清單 ${POPULAR.length} 個，喺 collection 搵到 ${found.length} 個\n`);
let priced = 0;
for (const c of found.sort((a, b) => Number(b.priceHkd ?? 0) - Number(a.priceHkd ?? 0))) {
  const p = Number(c.priceHkd ?? 0);
  if (p > 0) priced += 1;
  console.log(
    `  ${String(c.id).padEnd(18)} ${String(c.name ?? '').padEnd(22)} ` +
      `HK$${String(c.priceHkd ?? 0).padEnd(10)} ${p > 0 ? '✅' : '❌ 無價'}  ` +
      `img=${c.imageUrl ? 'y' : 'n'} set=${String(c.set ?? '').slice(0, 24)}`,
  );
}
console.log(`\n  有價: ${priced} / ${found.length}`);
