#!/usr/bin/env node
/**
 * What the platform account still has to do before Connect works.
 *
 * Enabling Connect is a dashboard setting, but the platform's own
 * requirements decide whether a connected account can be created and
 * paid out. Those requirements live on the account document, so the
 * list here is the same list the dashboard shows — just in a form
 * that can be read without clicking through four screens.
 *
 *   node scripts/stripe_platform_requirements.mjs
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const FILE =
  process.argv[2] ??
  path.join(os.homedir(), '.hermes/secrets/stripe-pokemarket.env');

const secrets = {};
for (const line of fs.readFileSync(FILE, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) secrets[m[1]] = m[2].trim();
}

const key = secrets.STRIPE_SECRET_KEY;
if (!key) {
  console.error('  no secret key in', FILE);
  process.exit(1);
}

const api = async (p) => {
  const r = await fetch('https://api.stripe.com/v1' + p, {
    headers: { Authorization: 'Bearer ' + key },
  });
  return { status: r.status, body: await r.json() };
};

const { status, body: acct } = await api('/account');
if (status !== 200) {
  console.error('  HTTP', status, JSON.stringify(acct).slice(0, 300));
  process.exit(1);
}

console.log('  ═══ 平台帳戶 ═══');
console.log('    id            ', acct.id);
console.log('    business      ', acct.business_profile?.name ?? '(unset)');
console.log('    country       ', acct.country);
console.log('    currency      ', acct.default_currency);
console.log('    charges       ', acct.charges_enabled);
console.log('    payouts       ', acct.payouts_enabled);
console.log('    details       ', acct.details_submitted);
console.log('    type          ', acct.type ?? '(standard)');

const req = acct.requirements ?? {};
console.log('\n  ═══ 平台自己仲差咩 ═══');
const groups = ['currently_due', 'eventually_due', 'past_due', 'pending_verification'];
let any = false;
for (const g of groups) {
  const list = req[g] ?? [];
  if (!list.length) continue;
  any = true;
  console.log(`    ${g}:`);
  for (const r of list) console.log(`      - ${r}`);
}
if (!any) console.log('    （冇未完成項目 ✅）');

if (acct.verification) {
  const v = acct.verification;
  console.log('\n  ═══ 驗證狀態 ═══');
  for (const [k, val] of Object.entries(v)) {
    if (val && typeof val === 'object' && val.status) {
      console.log(`    ${k.padEnd(22)} ${val.status}${val.details ? '' : ''}`);
      if (val.disabled_reason) console.log(`      └ ${val.disabled_reason}`);
    }
  }
}

const { status: s2, body: accs } = await api('/accounts?limit=5');
console.log('\n  ═══ 已建立嘅 connected accounts ═══');
console.log('    HTTP', s2, '· count:', (accs.data || []).length);
if ((accs.data || []).length === 0) {
  console.log('    （空 —— Connect 未開通，或者仲未建立過帳戶）');
}
