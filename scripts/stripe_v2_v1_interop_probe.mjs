#!/usr/bin/env node
/**
 * Can the v1 endpoints our functions still use work on a v2 account?
 *
 * The account has to be created with the v2 API — the v1
 * `capabilities[transfers]` request is dropped without a complaint
 * and the capability never activates. But our functions call v1
 * endpoints to hand the seller an onboarding link and to read the
 * account back. Whether those accept a v2 account id is the question,
 * and it decides how much of the code has to change.
 *
 *   node scripts/stripe_v2_v1_interop_probe.mjs
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

const v2 = async (p, method, body) => {
  const init = {
    method,
    headers: { Authorization: auth, 'Content-Type': 'application/json', 'Stripe-Version': VERSION },
  };
  if (body) init.body = JSON.stringify(body);
  const r = await fetch('https://api.stripe.com' + p, init);
  let j;
  try { j = await r.json(); } catch { j = {}; }
  return { status: r.status, body: j };
};

const v1 = async (p, method, form) => {
  const init = {
    method: method || 'GET',
    headers: { Authorization: auth },
  };
  if (form) {
    init.method = 'POST';
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = new URLSearchParams(form).toString();
  }
  const r = await fetch('https://api.stripe.com/v1' + p, init);
  let j;
  try { j = await r.json(); } catch { j = {}; }
  return { status: r.status, body: j };
};

console.log('  ═══ 1. v1 create 而家唔送 capabilities（睇平台設定有冇生效）═══');
{
  const { status, body } = await v1('/accounts', 'POST', {
    type: 'express',
    email: `nocap.${Date.now()}@example.com`,
  });
  console.log('    HTTP', status, '→ capabilities =', JSON.stringify(body.capabilities));
  if (body.id) {
    const d = await v1('/accounts/' + body.id, 'DELETE');
    console.log('    清理 → HTTP', d.status);
  }
}

console.log('\n  ═══ 2. 建一個 v2 帳戶，然後用 v1 endpoint 讀 / 開 link ═══');
const email = `interop.${Date.now()}@example.com`;
let acctId = null;
{
  const { status, body } = await v2('/v2/core/accounts', 'POST', {
    contact_email: email,
    display_name: 'Interop Test',
    identity: {
      country: 'hk',
      entity_type: 'individual',
      individual: { given_name: 'Test', surname: 'Seller' },
    },
    configuration: {
      recipient: {
        capabilities: { stripe_balance: { stripe_transfers: { requested: true } } },
      },
    },
    defaults: {
      responsibilities: { fees_collector: 'application', losses_collector: 'application' },
    },
    dashboard: 'express',
    include: ['configuration.recipient', 'requirements'],
  });
  console.log('    v2 建立 → HTTP', status, body.id ?? '');
  acctId = body.id;
}

if (acctId) {
  console.log('\n  ── v1 GET /v1/accounts/{id} ──');
  {
    const { status, body } = await v1('/accounts/' + acctId);
    console.log('    HTTP', status);
    if (body.id) {
      console.log('    object     ', body.object);
      console.log('    type       ', body.type);
      console.log('    country    ', body.country);
      console.log('    capabilities', JSON.stringify(body.capabilities));
      console.log('    charges_enabled ', body.charges_enabled);
      console.log('    payouts_enabled ', body.payouts_enabled);
      console.log('    details_submitted', body.details_submitted);
      console.log('    有冇 config 欄位:', 'config' in body ? '有' : '冇');
      console.log('    全部 key:', Object.keys(body).join(', '));
    } else {
      console.log('    ', String(body.error?.message || '').slice(0, 200));
    }
  }

  console.log('\n  ── v1 POST /v1/accounts/{id}/account_links（我哋派 onboarding link 用）──');
  {
    const { status, body } = await v1(`/accounts/${acctId}/account_links`, 'POST', {
      type: 'account_onboarding',
      refresh_url: 'https://pokemarket-255c6.web.app/?sellerOnboarding=refresh',
      return_url: 'https://pokemarket-255c6.web.app/?sellerOnboarding=done',
    });
    console.log('    HTTP', status);
    if (body.url) console.log('    onboarding link ✅', body.url.slice(0, 110) + '…');
    else console.log('    ', String(body.error?.message || JSON.stringify(body)).slice(0, 240));
  }

  console.log('\n  ── v2 有冇自己嘅 onboarding link endpoint ──');
  {
    const { status, body } = await v2(`/v2/core/accounts/${acctId}/account_links`, 'POST', {
      type: 'account_onboarding',
      refresh_url: 'https://pokemarket-255c6.web.app/?sellerOnboarding=refresh',
      return_url: 'https://pokemarket-255c6.web.app/?sellerOnboarding=done',
    });
    console.log('    POST /v2/.../account_links → HTTP', status);
    if (body.url) console.log('    ✅', body.url.slice(0, 110) + '…');
    else console.log('    ', String(body.error?.message || JSON.stringify(body)).slice(0, 200));
  }

  console.log('\n  ── v2 讀返狀態（我哋 on boarding status 用）──');
  {
    const { status, body } = await v2(
      `/v2/core/accounts/${acctId}?include=configuration.recipient,requirements`,
    );
    console.log('    HTTP', status);
    console.log('    configuration.recipient:', JSON.stringify(body.configuration?.recipient?.capabilities));
  }
}

console.log('\n  ═══ 清理 ═══');
if (acctId) {
  for (const [label, r] of [
    ['v2 DELETE', await v2('/v2/core/accounts/' + acctId, 'DELETE')],
    ['v2 POST /close', await v2('/v2/core/accounts/' + acctId + '/close', 'POST', {})],
    ['v1 DELETE', await v1('/accounts/' + acctId, 'DELETE')],
  ]) {
    console.log(`    ${label.padEnd(16)} HTTP ${r.status} ${String(r.body?.error?.message || '').slice(0, 110)}`);
  }
}
