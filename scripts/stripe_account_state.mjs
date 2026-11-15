#!/usr/bin/env node
/**
 * What Stripe thinks the account currently has.
 *
 * The secret key cannot be listed through the API, so this reports
 * what can be seen: the webhook endpoints, the publishable keys and
 * the connected accounts. After a key rotation this is how to tell
 * whether the endpoints the app depends on still point at us, and
 * whether the restricted key is the one we hold.
 *
 *   node scripts/stripe_account_state.mjs
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

const mask = (v) => (v && v.length > 12 ? v.slice(0, 10) + '…' + v.slice(-4) : '(none)');

console.log('  ═══ webhook endpoints ═══');
{
  const { status, body } = await api('/webhook_endpoints?limit=20');
  console.log('  HTTP', status, '· endpoints:', (body.data || []).length);
  for (const e of body.data || []) {
    console.log(
      `    ${e.id}\n      url     ${e.url}\n      status  ${e.status}` +
        `  disabled=${e.disabled}\n      desc    ${JSON.stringify(e.description || '')}\n` +
        `      events  ${(e.enabled_events || []).length}`,
    );
  }
}

console.log('\n  ═══ publishable keys ═══');
{
  const { status, body } = await api('/publishable_keys?limit=20');
  console.log('  HTTP', status, '· count:', (body.data || []).length);
  for (const k of body.data || []) {
    console.log(
      `    ${k.id}  ${mask(k.key)}  live=${k.livemode}  active=${k.active}`,
    );
  }
  const ours = secrets.STRIPE_PUBLISHABLE_KEY;
  const known = (body.data || []).some((k) => k.key === ours);
  console.log('  我哋儲存嘅 publishable key 仲喺帳戶入面:', known ? 'YES' : 'NO');
}

console.log('\n  ═══ connected accounts ═══');
{
  const { status, body } = await api('/accounts?limit=20');
  console.log('  HTTP', status, '· accounts:', (body.data || []).length);
  for (const a of body.data || []) {
    console.log(
      `    ${a.id}  ${a.country}  charges=${a.charges_enabled} payouts=${a.payouts_enabled}  ${a.email || a.business_type || ''}`,
    );
  }
}

console.log('\n  ═══ 儲存嘅憑證 ═══');
for (const [n, v] of Object.entries(secrets)) {
  if (!v) continue;
  console.log(`    ${n.padEnd(24)} ${mask(v)}`);
}
