#!/usr/bin/env node
/**
 * Why did the connected account's `transfers` capability come back
 * inactive?
 *
 * The capability a connected account can hold is decided by what the
 * platform account has enabled and for which account types. A request
 * the platform is not set up for is quietly ignored, so the symptom is
 * `inactive` rather than an error — which reads like "Stripe said no"
 * without saying no to anything.
 *
 *   node scripts/stripe_capability_probe.mjs
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

const stripe = async (p, method = 'GET') => {
  const r = await fetch('https://api.stripe.com/v1' + p, {
    method,
    headers: { Authorization: 'Bearer ' + key },
  });
  let body;
  try { body = await r.json(); } catch { body = {}; }
  return { status: r.status, body };
};

console.log('  ═══ 平台帳戶 capability（正確格式）═══');
{
  const { body } = await stripe('/account');
  const caps = body.capabilities ?? {};
  for (const [k, v] of Object.entries(caps)) {
    const st = typeof v === 'string' ? v : v?.status;
    console.log(`    ${k.padEnd(26)} ${st}${v?.disabled_reason ? '  (' + v.disabled_reason + ')' : ''}`);
  }
}

console.log('\n  ═══ 測試：建一個 Express 帳戶，睇 transfers 點回應 ═══');
const created = [];
for (const caps of [
  { label: 'explicit transfers requested', body: { transfers: { requested: true } } },
  { label: 'no capabilities at all', body: {} },
]) {
  const form = new URLSearchParams({
    type: 'express',
    email: `cap.probe.${Date.now()}@example.com`,
    'business_type': 'individual',
    ...Object.fromEntries(
      Object.entries(caps.body).map(([k, v]) => [`capabilities[${k}][requested]`, String(v.requested)]),
    ),
  });
  const { status, body } = await stripe('/accounts', 'POST');
  // POST needs a form body, so do it directly rather than through stripe().
  console.log(`  ${caps.label.padEnd(30)} (預期: ${JSON.stringify(caps.body)})`);
  if (status === 200) {
    console.log(`    capabilities.transfers = ${body.capabilities?.transfers}`);
    console.log(`    capabilities.card_payments = ${body.capabilities?.card_payments}`);
    created.push(body.id);
  } else {
    console.log(`    HTTP ${status} ${JSON.stringify(body.error?.message || '').slice(0, 150)}`);
  }
}

console.log('\n  ═══ 直接要求 transfers（用 capability update endpoint）═══');
for (const id of created) {
  const { status, body } = await stripe(`/accounts/${id}/capabilities`, 'POST');
  console.log(`    ${id}: HTTP ${status}  ${JSON.stringify(body).slice(0, 200)}`);
}

console.log('\n  ═══ 清理 ═══');
for (const id of created) {
  const { status } = await stripe(`/accounts/${id}`, 'DELETE');
  console.log(`    ${id} → HTTP ${status}`);
}

console.log('\n  ═══ tax locations（type 要係 performance）═══');
{
  const { status, body } = await stripe('/tax/locations?type=performance');
  if (status === 200) {
    const list = body.data || [];
    console.log('    地點數:', list.length);
    for (const l of list) console.log(`      - ${l.country} type=${l.type} active=${l.active}`);
    if (!list.length) console.log('      （冇登記地點 → 冇納稅義務要設定）');
  } else {
    console.log('    HTTP', status, JSON.stringify(body.error?.message || '').slice(0, 160));
  }
}
