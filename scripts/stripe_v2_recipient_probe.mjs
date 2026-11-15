#!/usr/bin/env node
/**
 * Can a seller account be created the way a marketplace needs?
 *
 * The v1 API accepts `capabilities[transfers][requested]=true` and
 * answers with `{"transfers":"inactive"}` — a capability the platform
 * will not grant, dropped without a complaint. The v2 API expresses
 * the same thing differently: a `recipient` configuration carrying the
 * `stripe_balance.stripe_transfers` capability, which is what the
 * marketplace guide says a platform that receives money and transfers
 * it out should use.
 *
 * The error names the field it does not recognise, so the payload is
 * walked towards a shape the account accepts rather than guessed.
 *
 *   node scripts/stripe_v2_recipient_probe.mjs
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
const VERSION = '2026-03-25.dahlia';

const call = async (p, method, body) => {
  const init = {
    method,
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
      'Stripe-Version': VERSION,
    },
  };
  if (body) init.body = JSON.stringify(body);
  const r = await fetch('https://api.stripe.com' + p, init);
  let j;
  try { j = await r.json(); } catch { j = {}; }
  return { status: r.status, body: j };
};

const email = `v2.seller.${Date.now()}@example.com`;

const base = {
  contact_email: email,
  display_name: 'V2 Seller Test',
  configuration: {
    recipient: {
      capabilities: {
        stripe_balance: { stripe_transfers: { requested: true } },
      },
    },
  },
  defaults: {
    responsibilities: {
      fees_collector: 'application',
      losses_collector: 'application',
    },
  },
  dashboard: 'express',
  include: ['configuration.recipient', 'identity', 'defaults', 'requirements'],
};

// Each attempt corrects the field the previous error complained about.
const CANDIDATES = [
  {
    label: 'given_name / surname',
    identity: {
      country: 'hk',
      entity_type: 'individual',
      individual: { given_name: 'Test', surname: 'Seller' },
    },
  },
  {
    label: '+ dob',
    identity: {
      country: 'hk',
      entity_type: 'individual',
      individual: {
        given_name: 'Test',
        surname: 'Seller',
        dob: { day: 1, month: 1, year: 1990 },
      },
    },
  },
  {
    label: '+ individual.address',
    identity: {
      country: 'hk',
      entity_type: 'individual',
      individual: {
        given_name: 'Test',
        surname: 'Seller',
        dob: { day: 1, month: 1, year: 1990 },
        address: {
          country: 'hk',
          line1: '1 Test Street',
          city: 'Hong Kong',
          postal_code: '000000',
        },
      },
    },
  },
];

console.log('  ═══ 建立 v2 recipient 帳戶 ═══');
let acct = null;
for (const cand of CANDIDATES) {
  const res = await call('/v2/core/accounts', 'POST', { ...base, identity: cand.identity });
  console.log(`    ── ${cand.label} → HTTP ${res.status}`);
  if (res.body.id) {
    acct = res.body;
    console.log('       ✅ 建立成功');
    break;
  }
  console.log('       ', String(res.body.error?.message || JSON.stringify(res.body)).slice(0, 480));
}

if (!acct) {
  console.log('    ❌ 全部形狀都失敗');
  process.exit(1);
}

console.log('\n  ═══ 建立出嚟嘅帳戶 ═══');
console.log('    id          ', acct.id);
console.log('    object      ', acct.object);
console.log('    dashboard   ', acct.dashboard);
console.log('    applied_configurations', JSON.stringify(acct.applied_configurations));
console.log('    configuration.recipient', JSON.stringify(acct.configuration?.recipient));
console.log('    defaults.responsibilities', JSON.stringify(acct.defaults?.responsibilities));
console.log('    requirements', JSON.stringify(acct.requirements?.currently_due ?? acct.requirements));

console.log('\n  ═══ 對住佢試 transfer（睇 capability 有冇生效）═══');
{
  const r = await fetch('https://api.stripe.com/v1/transfers', {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      amount: '1000',
      currency: 'hkd',
      destination: acct.id,
    }).toString(),
  });
  const t = await r.json();
  console.log('    HTTP', r.status, '→', String(t.error?.message || JSON.stringify(t).slice(0, 220)));
  if (t.id) {
    console.log('    ⚠️ transfer 成功 — 要即刻 reverse');
    await fetch(`https://api.stripe.com/v1/transfers/${t.id}/reversals`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ amount: '1000' }).toString(),
    });
  }
}

console.log('\n  ═══ 清理 ═══');
const del = await call('/v2/core/accounts/' + acct.id, 'DELETE');
console.log('    HTTP', del.status, String(del.body?.error?.message || '').slice(0, 140));
