/**
 * Create the Stripe webhook endpoint that points at the deployed
 * function, and keep its signing secret in the local secrets file.
 *
 * The endpoint that was already on the account pointed at
 * asia-east1, where this project's functions do not run, so every
 * delivery went nowhere. And Stripe does not let a signing secret be
 * read back through the API — it is only returned when the endpoint
 * is created. So the endpoint is created through the API, which is
 * the only way to get the secret without a human copying it out of a
 * dashboard.
 *
 * The secret is written to the file, never printed.
 *
 *   node scripts/setup_stripe_webhook.mjs [secrets-file]
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const PROJECT = 'pokemarket-255c6';
const REGION = 'us-central1';
const URL = `https://${REGION}-${PROJECT}.cloudfunctions.net/stripeWebhook`;
const FILE =
  process.argv[2] ?? path.join(os.homedir(), '.hermes/secrets/stripe-pokemarket.env');

// The events the handler acts on, plus the ones that keep a seller's
// onboarding status and their payout state current.
const EVENTS = [
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'charge.refunded',
  'transfer.created',
  'account.updated',
  'payout.paid',
  'payout.failed',
];

const secrets = {};
for (const line of fs.readFileSync(FILE, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) secrets[m[1]] = m[2].trim();
}
const key = secrets.STRIPE_SECRET_KEY;
if (!key) {
  console.error('  no STRIPE_SECRET_KEY in the file');
  process.exit(1);
}

const auth = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' };

// What is already on the account?
const listRes = await fetch(
  `https://api.stripe.com/v1/webhook_endpoints?limit=20`,
  { headers: { Authorization: `Bearer ${key}` } },
);
const list = (await listRes.json()).data ?? [];
console.log(`  帳戶上現有 ${list.length} 個 webhook endpoint:`);
for (const e of list) {
  console.log(`    ${e.id}  ${e.url}`);
  if (e.url !== URL) {
    console.log(`      ⚠️  指向錯誤 region，事件會投去一個冇 function 嘅地方`);
  }
}

const existing = list.find((e) => e.url === URL);
let endpoint = existing;

if (existing) {
  // Update the events so the handler receives everything it acts on.
  const body = new URLSearchParams();
  for (const ev of EVENTS) body.append('enabled_events[]', ev);
  const upd = await fetch(
    `https://api.stripe.com/v1/webhook_endpoints/${existing.id}`,
    { method: 'POST', headers: auth, body },
  );
  const updated = await upd.json();
  if (!upd.ok) {
    console.error(`  could not update the endpoint: ${JSON.stringify(updated).slice(0, 300)}`);
    process.exit(1);
  }
  endpoint = updated;
  console.log(`\n  ✅ 已有 endpoint，事件已更新`);
  console.log('  ⚠️  但 Stripe 唔會再畀返 signing secret —— 如果本機冇存，需要人手重設');
} else {
  const body = new URLSearchParams();
  body.set('url', URL);
  body.set('description', 'PokeMarket escrow');
  for (const ev of EVENTS) body.append('enabled_events[]', ev);

  const createRes = await fetch('https://api.stripe.com/v1/webhook_endpoints', {
    method: 'POST',
    headers: auth,
    body,
  });
  const created = await createRes.json();
  if (!createRes.ok) {
    console.error(`  could not create the endpoint: ${JSON.stringify(created).slice(0, 400)}`);
    process.exit(1);
  }
  endpoint = created;
  console.log(`\n  ✅ 已建立 endpoint ${created.id}`);
  console.log(`     url:    ${created.url}`);
  console.log(`     events: ${(created.enabled_events ?? []).join(', ')}`);

  // The signing secret is returned exactly once, at creation.
  if (created.secret) {
    let text = fs.readFileSync(FILE, 'utf-8');
    const line = `STRIPE_WEBHOOK_SECRET=${created.secret}`;
    text = text.includes('STRIPE_WEBHOOK_SECRET=')
      ? text.replace(/^STRIPE_WEBHOOK_SECRET=.*$/m, line)
      : text.replace(/\n*$/, `\n${line}\n`);
    fs.writeFileSync(FILE, text, { mode: 0o600 });
    fs.chmodSync(FILE, 0o600);
    console.log('  ✅ signing secret 已寫入本機密鑰檔（冇印出嚟）');
  } else {
    console.error('  ❌ Stripe 冇回傳 signing secret');
    process.exit(1);
  }
}

// Remove the endpoints that point at a region this project does not
// use — every delivery to them fails, and a failing endpoint makes
// Stripe retry forever.
for (const e of list) {
  if (e.url === URL) continue;
  const del = await fetch(`https://api.stripe.com/v1/webhook_endpoints/${e.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${key}` },
  });
  console.log(
    del.ok
      ? `  🧹 刪咗指向錯 region 嘅 endpoint ${e.id}`
      : `  ⚠️  刪唔到 ${e.id}`,
  );
}
