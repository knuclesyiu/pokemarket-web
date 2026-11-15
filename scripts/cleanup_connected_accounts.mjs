#!/usr/bin/env node
/**
 * Close the connected accounts the probes left behind.
 *
 * A connected account on a live platform cannot always be deleted
 * through the API — the platform's controller settings decide which
 * method is allowed, and the answer is an error rather than a refusal
 * at creation. The v2 API has its own close, which asks for the
 * configurations to be named.
 *
 * Accounts that cannot be closed by either route are listed for the
 * dashboard, which can always remove them.
 *
 *   node scripts/cleanup_connected_accounts.mjs
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const secrets = {};
for (const line of
  fs.readFileSync(path.join(os.homedir(), '.hermes/secrets/stripe-pokemarket.env'), 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) secrets[m[1]] = m[2].trim();
}
const auth = 'Bearer ' + secrets.STRIPE_SECRET_KEY;

const call = async (p, method, body, version) => {
  const headers = { Authorization: auth, 'Content-Type': 'application/json' };
  if (version) headers['Stripe-Version'] = version;
  const init = { method, headers };
  if (body) init.body = JSON.stringify(body);
  const r = await fetch('https://api.stripe.com' + p, init);
  let j;
  try { j = await r.json(); } catch { j = {}; }
  return { status: r.status, body: j };
};

const KEEP = process.argv[2]; // an account id to leave alone

const { body: list } = await call('/v1/accounts?limit=100', 'GET');
const accounts = list.data || [];
console.log('  ═══ 現有 connected accounts：' + accounts.length + ' ═══');

let closed = 0;
const stuck = [];

for (const a of accounts) {
  if (a.id === KEEP) {
    console.log(`    ${a.id} 保留（係你嘅賣家帳戶）`);
    continue;
  }
  const isProbe = /example\.com$/.test(a.email || '') || a.email === null;
  if (!isProbe) {
    console.log(`    ${a.id} (${a.email}) 唔似 probe，唔郁`);
    continue;
  }

  // What the v2 API says the account is, so the close can name it.
  const v2 = await call(
    `/v2/core/accounts/${a.id}?include=configuration.recipient`,
    'GET',
    null,
    '2026-03-25.dahlia',
  );
  const configs = v2.body?.applied_configurations ?? [];
  let done = false;

  if (v2.status === 200 && configs.length) {
    const c = await call(
      `/v2/core/accounts/${a.id}/close`,
      'POST',
      { applied_configurations: configs },
      '2026-03-25.dahlia',
    );
    if (c.status === 200 || c.status === 201) {
      console.log(`    ${a.id} ✅ 已用 v2 close 關閉`);
      closed++;
      done = true;
    }
  }

  if (!done) {
    const d = await fetch(`https://api.stripe.com/v1/accounts/${a.id}`, {
      method: 'DELETE',
      headers: { Authorization: auth },
    });
    if (d.ok) {
      console.log(`    ${a.id} ✅ 已用 v1 DELETE 刪除`);
      closed++;
      done = true;
    } else {
      let j = {};
      try { j = await d.json(); } catch {}
      const msg = String(j.error?.message ?? '').slice(0, 110);
      console.log(`    ${a.id} ⚠️ API 刪唔到（HTTP ${d.status}）${msg}`);
      stuck.push({ id: a.id, email: a.email, msg });
    }
  }
}

console.log(`\n  關閉咗 ${closed} 個`);
if (stuck.length) {
  console.log('\n  ═══ API 刪唔到、要用 dashboard 清理 ═══');
  console.log('  https://dashboard.stripe.com/connect/accounts');
  for (const s of stuck) {
    console.log(`    ${s.id}  ${s.email ?? '(no email)'}`);
  }
  console.log('  喺 dashboard 揀「測試戶口」或者佢哋嗰欄，撳 Delete。');
  console.log('  （佢哋係空帳戶，冇交易、冇錢，唔影響任何嘢）');
}
