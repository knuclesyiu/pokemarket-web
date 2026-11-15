#!/usr/bin/env node
/**
 * Which capabilities can a connected account actually be given?
 *
 * A capability the platform does not allow comes back `inactive` and
 * nothing else — no error, no reason. Asking for each one on its own
 * and reading the status back is the only way to see which are
 * allowed, and it takes the guesswork out of "the platform is set up
 * wrong" versus "the code asks for the wrong thing".
 *
 *   node scripts/stripe_allowed_capabilities.mjs
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
const H = { Authorization: 'Bearer ' + secrets.STRIPE_SECRET_KEY };
const FORM = { ...H, 'Content-Type': 'application/x-www-form-urlencoded' };

const create = async (params) => {
  const r = await fetch('https://api.stripe.com/v1/accounts', {
    method: 'POST',
    headers: FORM,
    body: new URLSearchParams(params).toString(),
  });
  return { status: r.status, body: await r.json() };
};
const remove = async (id) => {
  const r = await fetch('https://api.stripe.com/v1/accounts/' + id, { method: 'DELETE', headers: H });
  return r.status;
};

const CANDIDATES = ['transfers', 'card_payments', 'legacy_payments'];

console.log('  ═══ 逐個 capability 測 ═══');
for (const c of CANDIDATES) {
  const params = {
    type: 'express',
    email: `cap.one.${Date.now()}@example.com`,
    'business_type': 'individual',
    [`capabilities[${c}][requested]`]: 'true',
  };
  const { status, body } = await create(params);
  if (body.id) {
    const st = body.capabilities?.[c];
    const verdict =
      st === 'requested' ? '✅ requested — 平台准'
      : st === 'active' ? '✅ active'
      : st === 'pending' ? '⏳ pending'
      : '❌ inactive — 平台唔准，請求被靜靜忽略';
    console.log(`    ${c.padEnd(18)} ${verdict}`);
    await remove(body.id);
  } else {
    console.log(`    ${c.padEnd(18)} HTTP ${status} — ${String(body.error?.message || '').slice(0, 150)}`);
  }
}

console.log('\n  ═══ 完全唔送 capabilities（睇平台按國家自動 request 咩）═══');
{
  const { status, body } = await create({
    type: 'express',
    email: `cap.none.${Date.now()}@example.com`,
  });
  console.log('    HTTP', status, '→', JSON.stringify(body.capabilities));
  if (body.id) await remove(body.id);
}

console.log('\n  ═══ 對照：Standard 帳戶類型會唔會自動攞到 capability ═══');
for (const type of ['standard', 'custom']) {
  for (const withCap of [false, true]) {
    const params = {
      type,
      email: `cap.${type}.${Date.now()}@example.com`,
      'business_type': 'individual',
    };
    if (withCap) params['capabilities[transfers][requested]'] = 'true';
    const { status, body } = await create(params);
    if (body.id) {
      console.log(
        `    type=${type.padEnd(9)} ${withCap ? '送 transfers  ' : '唔送         '}→ ` +
          `${JSON.stringify(body.capabilities)}  dashboard=${body.dashboard?.type ?? body.dashboard ?? 'n/a'}`,
      );
      await remove(body.id);
    } else {
      console.log(`    type=${type} ${withCap ? '送' : '唔送'} → HTTP ${status} ${String(body.error?.message || '').slice(0, 110)}`);
    }
  }
}

console.log('\n  ═══ 平台 profile / Connect 設定（如果 API 有得讀）═══');
for (const p of [
  '/connect/settings/profile',
  '/settings/connect/onboarding-options/countries',
  '/account/applications/settings/express',
]) {
  const r = await fetch('https://api.stripe.com/v1' + p, { headers: H });
  console.log(`    GET ${p} → HTTP ${r.status}`);
}
