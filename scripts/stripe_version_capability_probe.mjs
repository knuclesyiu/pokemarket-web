#!/usr/bin/env node
/**
 * Does the API version decide whether a capability request is honoured?
 *
 * The platform's own default API version is newer than the one the
 * installed SDK pins. A parameter that a newer version no longer
 * accepts is dropped without a complaint, so a capability request can
 * come back `inactive` on one version and `requested` on another —
 * and nothing in the response says the parameter was ignored.
 *
 *   node scripts/stripe_version_capability_probe.mjs
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

const create = async (version) => {
  const headers = {
    Authorization: auth,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (version) headers['Stripe-Version'] = version;
  const r = await fetch('https://api.stripe.com/v1/accounts', {
    method: 'POST',
    headers,
    body: new URLSearchParams({
      type: 'express',
      email: `ver.${Date.now()}@example.com`,
      'capabilities[transfers][requested]': 'true',
    }).toString(),
  });
  const a = await r.json();
  return { status: r.status, body: a };
};
const remove = async (id) => {
  const r = await fetch('https://api.stripe.com/v1/accounts/' + id, {
    method: 'DELETE',
    headers: { Authorization: auth },
  });
  return r.status;
};

const VERSIONS = [
  null, // no header — the account's default
  '2026-03-25.dahlia',
  '2025-09-30.clover',
  '2025-03-31.basil',
  '2025-02-24.acacia',
  '2024-06-20',
];

console.log('  ═══ v1 accounts.create + capabilities[transfers] 逐個 API version ═══');
for (const v of VERSIONS) {
  const { status, body } = await create(v);
  const label = (v ?? '(無 header → 帳戶預設)').padEnd(26);
  if (body.id) {
    console.log(`    ${label} HTTP ${status}  capabilities=${JSON.stringify(body.capabilities)}`);
    await remove(body.id);
  } else {
    console.log(`    ${label} HTTP ${status}  ${String(body.error?.message || '').slice(0, 130)}`);
  }
}
