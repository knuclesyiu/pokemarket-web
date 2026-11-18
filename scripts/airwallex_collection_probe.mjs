/**
 * Probe the Airwallex collection rail.
 *
 * Run it with the credentials in place:
 *   set -a && source ~/.hermes/secrets/airwallex-pokemarket.env && set +a
 *   node scripts/airwallex_collection_probe.mjs
 *
 * It creates a payment intent for a small amount, reads it back, and
 * cancels it. An intent that is never confirmed and then cancelled
 * moves no money — the probe is safe against a production account.
 */

const ENV = process.env.AIRWALLEX_ENV === 'sandbox' ? 'sandbox' : 'production';
const BASE =
  ENV === 'sandbox'
    ? 'https://api.sandbox.airwallex.com'
    : 'https://api.airwallex.com';

const CLIENT_ID = (process.env.AIRWALLEX_ENV === 'sandbox'
    ? process.env.AIRWALLEX_SANDBOX_CLIENT_ID
    : process.env.AIRWALLEX_CLIENT_ID);
const API_KEY = (process.env.AIRWALLEX_ENV === 'sandbox'
    ? process.env.AIRWALLEX_SANDBOX_API_KEY
    : process.env.AIRWALLEX_API_KEY);

if (!CLIENT_ID || !API_KEY || CLIENT_ID === 'NOT_CONFIGURED') {
  console.error('✖ 未設定 AIRWALLEX_CLIENT_ID / AIRWALLEX_API_KEY');
  process.exit(1);
}

let passed = 0;
let failed = 0;
function check(label, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  ✅ ${label}${detail ? ' — ' + detail : ''}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
  }
}

async function token() {
  const res = await fetch(`${BASE}/api/v1/authentication/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'x-client-id': CLIENT_ID,
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      api_key: API_KEY,
      grant_type: 'client_credentials',
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`登入失敗 HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const j = JSON.parse(text);
  const accessToken = j.access_token ?? j.token;
  if (!accessToken) throw new Error(`回應冇 token：${text.slice(0, 200)}`);
  return { accessToken, expiresIn: j.expires_in ?? j.expires_at };
}

let ACCESS = '';

async function call(path, body, method = 'POST') {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${ACCESS}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, ok: res.ok, body: parsed, raw: text };
}

console.log(`\n  Airwallex ${ENV} 收款鏈探測\n`);

console.log('  ════ 1. 認證 ════');
try {
  const t = await token();
  ACCESS = t.accessToken;
  check('攞到 access token', Boolean(ACCESS), `expires_in=${t.expiresIn}s`);
} catch (e) {
  check('攞到 access token', false, String(e.message).slice(0, 250));
  console.log(`\n  結果：${passed} 通過 / ${failed} 失敗\n`);
  process.exit(1);
}

console.log('\n  ════ 2. 開收款單（PaymentIntent）════');
const orderId = `probe-${Date.now()}`;
const intent = await call('/api/v1/pa/payment_intents/create', {
  amount: 1000, // HK$10.00 in minor units
  currency: 'HKD',
  merchant_order_id: orderId,
  request_id: `pm-${orderId}`,
  metadata: { orderId, probe: 'true' },
});
const intentId = intent.body?.id;
check(
  '開到收款單',
  intent.ok && Boolean(intentId) && Boolean(intent.body?.client_secret),
  intent.ok
    ? `id=${intentId} status=${intent.body?.status} client_secret=${intent.body?.client_secret ? '有' : '冇'}`
    : `HTTP ${intent.status} ${String(intent.raw).slice(0, 400)}`,
);

if (intentId) {
  console.log('\n  ════ 3. 讀返收款單 ════');
  const fetched = await call(`/api/v1/pa/payment_intents/${intentId}`, undefined, 'GET');
  check(
    '讀到收款單',
    fetched.ok && fetched.body?.id === intentId,
    fetched.ok ? `status=${fetched.body?.status} amount=${fetched.body?.amount}` : `HTTP ${fetched.status}`,
  );
  check(
    '金額同幣種啱',
    fetched.ok && Number(fetched.body?.amount) === 1000 && fetched.body?.currency === 'HKD',
    fetched.ok ? `amount=${fetched.body?.amount} ${fetched.body?.currency}` : '—',
  );

  console.log('\n  ════ 4. 取消收款單（唔郁錢）════');
  const cancelled = await call(`/api/v1/pa/payment_intents/${intentId}/cancel`, {});
  check(
    '取消到收款單',
    cancelled.ok,
    cancelled.ok ? `status=${cancelled.body?.status}` : `HTTP ${cancelled.status} ${String(cancelled.raw).slice(0, 200)}`,
  );
}

console.log(`\n  結果：${passed} 通過 / ${failed} 失敗\n`);
process.exit(failed > 0 ? 1 : 0);
