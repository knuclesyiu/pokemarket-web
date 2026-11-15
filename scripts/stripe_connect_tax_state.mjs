#!/usr/bin/env node
/**
 * Is Connect live, and does anything tax-related block it?
 *
 * Two questions, one place. Stripe's tax screens mix three different
 * things — the Tax product that calculates tax at checkout, tax
 * *reporting*, which files what you already collected, and location
 * registrations, which are what reporting is built on. Only the third
 * can block anything, and it only blocks if a jurisdiction needs
 * registering.
 *
 *   node scripts/stripe_connect_tax_state.mjs
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
const api = async (p) => {
  const r = await fetch('https://api.stripe.com/v1' + p, {
    headers: { Authorization: 'Bearer ' + key },
  });
  let body;
  try {
    body = await r.json();
  } catch {
    body = {};
  }
  return { status: r.status, body };
};

console.log('  ═══ 平台 capabilities（開咗 Connect 交易平台就會有 transfers）═══');
{
  const { status, body } = await api('/account/capabilities');
  if (status === 200) {
    for (const [k, v] of Object.entries(body)) {
      console.log(`    ${k.padEnd(18)} ${v.status}${v.disabled_reason ? '  (' + v.disabled_reason + ')' : ''}`);
    }
  } else {
    console.log('    HTTP', status, JSON.stringify(body).slice(0, 160));
  }
}

console.log('\n  ═══ Tax 設定（Stripe Tax 產品本身）═══');
{
  const { status, body } = await api('/tax/settings');
  if (status === 200) {
    console.log('    status                     ', body.status ?? '(unset)');
    console.log('    tax_id                    ', body.tax_id ?? '(none)');
    console.log('    automatic_tax_enabled     ', body.automatic_tax?.enabled ?? 'n/a');
    console.log('    default_source             ', body.default_source?.type ?? '(none)');
    console.log('    livemode                  ', body.livemode);
  } else {
    console.log('    HTTP', status, JSON.stringify(body).slice(0, 200));
  }
}

console.log('\n  ═══ 已登記地點（tax reporting 靠佢；冇地點 = 冇嘢要報）═══');
{
  const { status, body } = await api('/tax/locations?limit=50');
  if (status === 200) {
    const list = body.data || [];
    console.log('    地點數:', list.length);
    for (const l of list) {
      console.log(`      - ${l.country} (${l.type ?? 'n/a'}) source=${l.source ?? 'manual'}  active=${l.active}`);
    }
    if (!list.length) console.log('      （冇登記任何地點 → 冇納稅義務要設定）');
  } else {
    console.log('    HTTP', status, JSON.stringify(body).slice(0, 200));
  }
}

console.log('\n  ═══ 平台自己未完成嘅要求 ═══');
{
  const { status, body } = await api('/account');
  const req = body.requirements ?? {};
  let any = false;
  for (const g of ['currently_due', 'eventually_due', 'past_due', 'pending_verification']) {
    const list = req[g] ?? [];
    if (!list.length) continue;
    any = true;
    console.log(`    ${g}: ${list.join(', ')}`);
  }
  if (!any) console.log('    （冇 ✅）');
}

console.log('\n  ═══ 已建立嘅 connected accounts ═══');
{
  const { status, body } = await api('/accounts?limit=10');
  const list = body.data || [];
  console.log('    HTTP', status, '· count:', list.length);
  for (const a of list) {
    console.log(
      `      ${a.id}  ${a.type}  ${a.country}  details=${a.details_submitted}  payouts=${a.payouts_enabled}`,
    );
  }
}
