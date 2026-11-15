#!/usr/bin/env node
/**
 * Try the Accounts v2 API for the connected account.
 *
 * The v1 API refused the `transfers` capability without saying why —
 * it came back `inactive`, no error. The v2 API expresses the same
 * intent differently: a `recipient` configuration carrying the
 * `stripe_balance.stripe_transfers` capability, which is what the
 * marketplace guide says a platform that receives money and transfers
 * it out should use.
 *
 * If v2 is available on this account, the seller can be created
 * without any dashboard fiddling. If it is not, the error says so and
 * the dashboard remains the only route.
 *
 *   node scripts/stripe_v2_account_probe.mjs
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

// The v2 API is versioned separately and refuses to answer without a
// version header, so each attempt carries its own.
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

const VERSIONS = [
  '2026-03-25.dahlia',
  '2025-09-30.clover',
  '2025-04-30.basil',
  '2025-03-31.basil',
  'preview',
];

console.log('  ═══ v2 endpoint 存在唔存在（試各個 API version）═══');
let v2ok = null;
for (const v of VERSIONS) {
  const { status, body } = await call('/v2/core/accounts', 'GET', null, v);
  const msg = body.error?.message ? String(body.error.message).slice(0, 120) : 'OK';
  console.log(`    ${v.padEnd(22)} HTTP ${status}  ${msg}`);
  if (status < 400) v2ok = v;
}
console.log('    → 可用版本:', v2ok ?? '(冇一個 work)');

console.log('\n  ═══ v2 建一個 recipient 帳戶 ═══');
const payload = {
  dashboard: 'express',
  country: 'HK',
  email: `v2.probe.${Date.now()}@example.com`,
  defaults: {
    responsibilities: {
      losses_collector: 'application',
      fees_collector: 'application',
    },
    controller: {
      losses: { payments: 'application' },
      fees: { payer: 'application' },
      stripe_dashboard: { type: 'express' },
    },
  },
  configuration: {
    recipient: {
      capabilities: {
        stripe_balance: { stripe_transfers: { requested: true } },
      },
    },
  },
};
{
  const { status, body } = await call('/v2/core/accounts', 'POST', payload, v2ok);
  console.log('    HTTP', status);
  if (body.id) {
    console.log('    id        ', body.id);
    console.log('    dashboard ', body.dashboard);
    console.log('    configuration', JSON.stringify(body.configuration));
    console.log('    capabilities', JSON.stringify(body.capabilities));
    const del = await call('/v2/core/accounts/' + body.id, 'DELETE', null, v2ok);
    console.log('    清理 → HTTP', del.status);
  } else {
    console.log('    ', JSON.stringify(body.error?.message || body).slice(0, 400));
  }
}

console.log('\n  ═══ v1 再試一次（睇下係咪有傳播延遲）═══');
{
  const r = await fetch('https://api.stripe.com/v1/accounts', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + secrets.STRIPE_SECRET_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      type: 'express',
      email: `retry.${Date.now()}@example.com`,
      'capabilities[transfers][requested]': 'true',
    }).toString(),
  });
  const a = await r.json();
  console.log('    capabilities:', JSON.stringify(a.capabilities));
  console.log('    requirements:', JSON.stringify(a.requirements));
  console.log('    future_requirements:', JSON.stringify(a.future_requirements));
  if (a.id) {
    const d = await fetch('https://api.stripe.com/v1/accounts/' + a.id, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + secrets.STRIPE_SECRET_KEY },
    });
    console.log('    清理 → HTTP', d.status);
  }
}
