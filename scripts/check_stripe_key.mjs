/**
 * Check the Stripe credential, with a control.
 *
 * A control separates "the key is wrong" from "the endpoint or the
 * method is wrong": the real key should answer 200, a deliberately
 * wrong key should be refused. Without it, a 404 reads like a bad
 * key and sends the search in the wrong direction.
 *
 * The key is read from the local secrets file and sent in a header —
 * never on a command line, where it would show up in `ps`.
 *
 *   node scripts/check_stripe_key.mjs [secrets-file]
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

const real = secrets.STRIPE_SECRET_KEY;
if (!real) {
  console.error('  no STRIPE_SECRET_KEY in the file');
  process.exit(1);
}

async function probe(key, label) {
  const res = await fetch('https://api.stripe.com/v1/account', {
    headers: { Authorization: `Bearer ${key}` },
  });
  const body = await res.json().catch(() => ({}));
  console.log(`  ${label}: HTTP ${res.status}`);
  if (res.ok && body) {
    console.log(`     帳戶: ${body.business_type ?? '?'} / ${body.country ?? '?'}`);
    console.log(`     charges_enabled: ${body.charges_enabled}  payouts_enabled: ${body.payouts_enabled}`);
    console.log(`     currency: ${body.default_currency}  country: ${body.country}`);
    if (body.details_submitted !== undefined) {
      console.log(`     details_submitted: ${body.details_submitted}`);
    }
    if (body.requirements) {
      const pending = body.requirements?.currently_due ?? [];
      console.log(`     仲欠嘅開戶要求: ${pending.length ? pending.join(', ') : '冇'}`);
    }
  } else {
    console.log(`     ${body?.error?.message ?? body?.error?.type ?? 'no body'}`);
  }
  return res.status;
}

console.log('  ── control ──');
const bad = await probe('sk_live_definitely_not_a_real_key_000000000000', '錯 key');
const good = await probe(real, '真 key');

console.log();
if (good === 200 && bad === 401) {
  console.log('  ✅ 金鑰有效（真 200 / 錯 401）');
  process.exit(0);
}
console.log(`  ❌ 結果唔符合預期（真 ${good} / 錯 ${bad}）`);
process.exit(1);
