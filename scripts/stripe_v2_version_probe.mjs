#!/usr/bin/env node
/**
 * Which API version serves the v2 endpoints the marketplace flow
 * needs?
 *
 * The v2 endpoints are versioned separately from v1, and one of them —
 * the account link that sends a seller into Stripe's onboarding — is
 * still marked as a preview feature, so it wants a version header of
 * its own. The account's default version serves some endpoints and
 * refuses others, so each is tried on its own.
 *
 *   node scripts/stripe_v2_version_probe.mjs
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

const VERSIONS = [
  '2026-03-25.dahlia',
  '2026-09-30.endive',
  '2026-10-28.preview',
  '2025-07-30.preview',
];

const json = async (p, method, body, version) => {
  const headers = { Authorization: auth, 'Content-Type': 'application/json' };
  if (version) headers['Stripe-Version'] = version;
  const init = { method, headers };
  if (body) init.body = JSON.stringify(body);
  const r = await fetch('https://api.stripe.com' + p, init);
  let j;
  try { j = await r.json(); } catch { j = {}; }
  return { status: r.status, body: j };
};

// ── create a v2 account to test against ─────────────────────────────────────
let acctId = null;
{
  const { status, body } = await json(
    '/v2/core/accounts',
    'POST',
    {
      contact_email: `v2link.${Date.now()}@example.com`,
      display_name: 'Link Probe',
      identity: { country: 'hk', entity_type: 'individual',
        individual: { given_name: 'Test', surname: 'Seller' } },
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
    },
    '2026-03-25.dahlia',
  );
  console.log('  建立 v2 帳戶 → HTTP', status, acctId = body.id ?? '');
  if (!acctId) {
    console.log('   ', String(body.error?.message || '').slice(0, 300));
    process.exit(1);
  }
}

console.log('\n  ═══ POST /v2/core/account_links（派 onboarding link）═══');
let linkOk = null;
for (const v of VERSIONS) {
  const { status, body } = await json(
    '/v2/core/account_links',
    'POST',
    {
      account: acctId,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          refresh_url: 'https://pokemarket-255c6.web.app/?sellerOnboarding=refresh',
          return_url: 'https://pokemarket-255c6.web.app/?sellerOnboarding=done',
        },
      },
    },
    v,
  );
  const msg = body.url ? '✅ ' + body.url.slice(0, 80) + '…' : String(body.error?.message || '').slice(0, 150);
  console.log(`    ${v.padEnd(22)} HTTP ${status}  ${msg}`);
  if (body.url) linkOk = v;
}
console.log('    → 可用版本:', linkOk ?? '(冇一個 work)');

console.log('\n  ═══ GET /v2/core/accounts/{id}?include=...（讀狀態）═══');
for (const v of VERSIONS) {
  const { status, body } = await json(
    `/v2/core/accounts/${acctId}?include=configuration.recipient&include=requirements`,
    'GET',
    null,
    v,
  );
  const st = body.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
  console.log(`    ${v.padEnd(22)} HTTP ${status}  stripe_transfers=${st ?? 'n/a'}`);
}

console.log('\n  ═══ 完整 capability 狀態（用 linkOk 版本）═══');
{
  const { body } = await json(
    `/v2/core/accounts/${acctId}?include=configuration.recipient&include=requirements&include=defaults`,
    'GET',
    null,
    linkOk ?? '2026-03-25.dahlia',
  );
  console.log('    ', JSON.stringify(body.configuration?.recipient?.capabilities, null, 1).replace(/\n/g, '\n     '));
}

console.log('\n  ═══ 清理 ═══');
{
  const { status, body } = await json(`/v2/core/accounts/${acctId}/close`, 'POST', {}, linkOk ?? '2026-03-25.dahlia');
  console.log('    close → HTTP', status, String(body.error?.message || '').slice(0, 200));
  if (status !== 200) {
    const d = await fetch(`https://api.stripe.com/v1/accounts/${acctId}`, {
      method: 'DELETE',
      headers: { Authorization: auth },
    });
    console.log('    v1 DELETE → HTTP', d.status);
  }
}
