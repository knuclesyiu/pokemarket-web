#!/usr/bin/env node
/**
 * Does the connected account's `transfers` capability actually matter?
 *
 * The capability comes back `inactive` on a freshly created Express
 * account, which reads like a refusal. It may not be one: a transfer
 * that is rejected for a missing capability fails with a different
 * message than one that is rejected for money the platform does not
 * have. The error text says which one it is, so no money is needed to
 * find out.
 *
 *   node scripts/stripe_transfer_capability_probe.mjs
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
const key = secrets.STRIPE_SECRET_KEY;

const stripe = async (p, body) => {
  const init = { headers: { Authorization: 'Bearer ' + key } };
  if (body) {
    init.method = 'POST';
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = new URLSearchParams(body).toString();
  }
  const r = await fetch('https://api.stripe.com/v1' + p, init);
  let j;
  try { j = await r.json(); } catch { j = {}; }
  return { status: r.status, body: j };
};

console.log('  ═══ 平台餘額 ═══');
{
  const { body } = await stripe('/balance');
  for (const b of body.available || []) {
    console.log(`    ${b.currency} available=${b.amount}  pending=${b.pending}`);
  }
}

const created = [];
console.log('\n  ═══ 建 Express 帳戶（完全照我哋 function 嘅參數）═══');
{
  const { status, body } = await stripe('/accounts', {
    type: 'express',
    email: `cap.probe.${Date.now()}@example.com`,
    business_type: 'individual',
    'capabilities[transfers][requested]': 'true',
  });
  console.log('    HTTP', status);
  if (status === 200) {
    created.push(body.id);
    console.log('    id                    ', body.id);
    console.log('    type                  ', body.type);
    console.log('    country               ', body.country);
    console.log('    capabilities          ', JSON.stringify(body.capabilities));
    console.log('    details_submitted     ', body.details_submitted);
    console.log('    charges_enabled       ', body.charges_enabled);
    console.log('    payouts_enabled       ', body.payouts_enabled);
    console.log('    default_currency      ', body.default_currency);
  } else {
    console.log('    ', JSON.stringify(body.error?.message || '').slice(0, 200));
  }
}

console.log('\n  ═══ 試 transfers.create（錯誤訊息會話我哋知 capability 係咪真問題）═══');
for (const id of created) {
  const { status, body } = await stripe('/transfers', {
    amount: '1000',
    currency: 'hkd',
    destination: id,
  });
  const msg = body.error?.message ?? JSON.stringify(body).slice(0, 200);
  console.log(`    HTTP ${status}  ${msg.slice(0, 260)}`);
  if (/capability|does not support|not enabled/i.test(msg)) {
    console.log('    → ❌ 係 capability 問題');
  } else if (/insufficient|balance/i.test(msg)) {
    console.log('    → ✅ capability 冇問題（只係平台冇錢）');
  }
}

console.log('\n  ═══ 睇 onboarding link 對帳戶做咗咩（capabilities 有冇被改）═══');
for (const id of created) {
  const { status, body } = await stripe(`/accounts/${id}`);
  console.log(`    ${id}: capabilities = ${JSON.stringify(body.capabilities)}`);
  console.log(`       charges=${body.charges_enabled} payouts=${body.payouts_enabled} details=${body.details_submitted}`);
}

console.log('\n  ═══ 清理 ═══');
for (const id of created) {
  const { status, body } = await stripe(`/accounts/${id}`, null);
  if (status !== 200) {
    const del = await fetch(`https://api.stripe.com/v1/accounts/${id}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + key },
    });
    let j = {};
    try { j = await del.json(); } catch {}
    console.log(`    ${id} → HTTP ${del.status} ${JSON.stringify(j.error?.message || '').slice(0, 140)}`);
  } else {
    console.log(`    ${id} → 已存在`);
  }
}

console.log('\n  ═══ 順手清走上一輪 probe 漏咗嘅帳戶 ═══');
{
  const { body } = await stripe('/accounts?limit=100');
  const list = body.data || [];
  for (const a of list) {
    const r = await fetch(`https://api.stripe.com/v1/accounts/${a.id}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + key },
    });
    let j = {};
    try { j = await r.json(); } catch {}
    console.log(`    ${a.id} (${a.email}) → HTTP ${r.status} ${JSON.stringify(j.error?.message || '').slice(0, 120)}`);
  }
  if (!list.length) console.log('    （冇殘留）');
}
