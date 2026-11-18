/**
 * Probe the Airwallex payout rail against the sandbox.
 *
 * Run it with the credentials in place:
 *   set -a && source ~/.hermes/secrets/airwallex-pokemarket.env && set +a
 *   node scripts/airwallex_payout_probe.mjs
 *
 * Airwallex takes the beneficiary with the transfer, so the probe
 * asks for one transfer of HK$1,000 with obviously fake details and
 * reads it back. The account cannot open a connected account for an
 * individual seller, and none is needed.
 *
 * The amount is in the minor unit: HKD has two decimal places, so
 * HK$1,000.00 is 100000.
 */

const ENV = process.env.AIRWALLEX_ENV === 'production' ? 'production' : 'sandbox';
const BASE =
  ENV === 'production'
    ? 'https://api.airwallex.com'
    : 'https://api.sandbox.airwallex.com';

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
  const bodies = [
    { client_id: CLIENT_ID, api_key: API_KEY, grant_type: 'client_credentials' },
    { client_id: CLIENT_ID, client_secret: API_KEY, grant_type: 'client_credentials' },
  ];
  let last = '';
  for (const body of bodies) {
    const res = await fetch(`${BASE}/api/v1/authentication/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'x-client-id': CLIENT_ID,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (res.ok) {
      const j = JSON.parse(text);
      const value = j.access_token ?? j.token;
      if (value) return String(value);
      last = '回應冇 token';
      continue;
    }
    last = `HTTP ${res.status}: ${text.slice(0, 300)}`;
    if (![400, 401, 403].includes(res.status)) break;
  }
  throw new Error(`登入失敗：${last}`);
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

console.log(`\n  Airwallex ${ENV} 出款鏈探測\n`);

console.log('  ════ 1. 認證 ════');
try {
  ACCESS = await token();
  check('攞到 access token', Boolean(ACCESS));
} catch (e) {
  check('攞到 access token', false, String(e.message).slice(0, 250));
  console.log(`\n  結果：${passed} 通過 / ${failed} 失敗\n`);
  process.exit(1);
}

console.log('\n  ════ 2. 出款（beneficiary 內嵌，唔使開收款帳戶）════');
const reference = `PM-PROBE-${Date.now()}`;
const transfer = await call('/api/v1/transfers/create', {
  transfer_amount: 100000, // HK$1,000.00 — HKD has two decimal places
  source_currency: 'HKD',
  transfer_currency: 'HKD',
  transfer_method: 'LOCAL',
  request_id: reference,
  reason: 'PokeMarket 賣家結算',
  reference,
  beneficiary: {
    entity_type: 'PERSONAL',
    bank_details: {
      account_name: 'Test Seller',
      account_currency: 'HKD',
      bank_country_code: 'HK',
      local_clearing_system: 'FPS',
      account_routing_type1: 'phone_number',
      account_routing_value1: '+852-91234567',
    },
  },
});
const transferId = transfer.body?.id;
check('出款 request 被接受', transfer.ok && Boolean(transferId),
  transfer.ok
    ? `id=${transferId} status=${transfer.body.status} 賣家收=${transfer.body.amount_beneficiary_receives} 平台付=${transfer.body.amount_payer_pays} fee=${transfer.body.fee_amount}`
    : `HTTP ${transfer.status} ${String(transfer.raw).slice(0, 260)}`);

if (transferId) {
  console.log('\n  ════ 3. 讀返出款單 ════');
  const read = await call(`/api/v1/transfers/${transferId}`, undefined, 'GET');
  check('讀得返出款單', read.ok,
    read.ok ? `status=${read.body.status} date=${read.body.transfer_date} ref=${read.body.short_reference_id}`
            : `HTTP ${read.status} ${String(read.raw).slice(0, 200)}`);
}

console.log(`\n  結果：${passed} 通過 / ${failed} 失敗\n`);
process.exit(failed === 0 ? 0 : 1);