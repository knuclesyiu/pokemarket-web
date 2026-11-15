/**
 * Remove the artefacts a live test leaves behind: the seller record
 * the server wrote, the order the payment intent created, and any
 * test users that survived.
 *
 * The `sellers` and `orders` collections are server-only, so this
 * writes with the Firebase CLI's access token rather than a client
 * SDK — the same rights the server has.
 *
 *   node scripts/cleanup_live_test_data.mjs <uid> [uid2 ...]
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const PROJECT = 'pokemarket-255c6';

const cfg = JSON.parse(
  fs.readFileSync(
    path.join(os.homedir(), '.config/configstore/firebase-tools.json'),
    'utf-8',
  ),
);
const body = new URLSearchParams({
  grant_type: 'refresh_token',
  refresh_token: cfg.tokens.refresh_token,
  client_id:
    '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
  client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
  scope: 'https://www.googleapis.com/auth/cloud-platform',
});
const tokRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body,
});
const access = (await tokRes.json()).access_token;

const docUrl = (p) =>
  `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${p}`;
const H = { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' };

async function list(prefix) {
  const res = await fetch(`${docUrl(prefix)}?pageSize=200`, { headers: H });
  if (!res.ok) return [];
  const json = await res.json();
  return (json.documents ?? []).map((d) => d.name.split('/documents/')[1]);
}

async function removeDoc(p) {
  const res = await fetch(docUrl(p), { method: 'DELETE', headers: H });
  return res.ok || res.status === 404;
}

const uids = process.argv.slice(2);
if (!uids.length) {
  console.error('usage: node scripts/cleanup_live_test_data.mjs <uid> [uid ...]');
  process.exit(1);
}

for (const uid of uids) {
  for (const p of [`sellers/${uid}`, `users/${uid}`, `users/${uid}/wallet/main`]) {
    const ok = await removeDoc(p);
    console.log(`  ${ok ? '✅' : '⚠️ '} ${p}`);
  }
  const walletTx = await list(`users/${uid}/transactions`);
  for (const t of walletTx) await removeDoc(t);
  const portfolio = await list(`users/${uid}/portfolio`);
  for (const t of portfolio) await removeDoc(t);
  if (walletTx.length || portfolio.length) {
    console.log(`  ✅ 順手清咗 ${walletTx.length} 筆交易紀錄 + ${portfolio.length} 張卡`);
  }
}

// Any order left behind by a test payment.
const orders = await list('orders');
console.log(`  orders collection 有 ${orders.length} 份文件`);
for (const o of orders) {
  const res = await fetch(docUrl(o), { headers: H });
  const j = await res.json();
  const fields = j.fields ?? {};
  const buyer = fields.buyerId?.stringValue ?? '';
  const seller = fields.sellerId?.stringValue ?? '';
  if (uids.includes(buyer) || uids.includes(seller)) {
    console.log(`  🧹 刪除測試訂單 ${o.split('/').pop()}`);
    await removeDoc(o);
  }
}

// Sources created by a release.
const sources = await list('payout_sources');
for (const src of sources) {
  const res = await fetch(docUrl(src), { headers: H });
  const seller = (await res.json()).fields?.sellerId?.stringValue ?? '';
  if (uids.includes(seller)) {
    console.log(`  🧹 刪除 payout_source ${src.split('/').pop()}`);
    await removeDoc(src);
  }
}
console.log('  ✅ 清理完成');
