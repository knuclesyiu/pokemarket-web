/**
 * Probe the Airwallex payout rail against the sandbox.
 *
 * Run it with the credentials in place:
 *   set -a && source ~/.hermes/secrets/airwallex-pokemarket.env && set +a
 *   node scripts/airwallex_payout_probe.mjs
 *
 * It creates a recipient account and a beneficiary with obviously fake
 * details, then asks for a transfer of a tiny amount. In the sandbox
 * nothing moves real money. In production it would.
 */

const ENV = process.env.AIRWALLEX_ENV === 'production' ? 'production' : 'sandbox';
const BASE =
  ENV === 'production'
    ? 'https://api.airwallex.com'
    : 'https://api.sandbox.airwallex.com';

const CLIENT_ID = process.env.AIRWALLEX_CLIENT_ID;
const API_KEY = process.env.AIRWALLEX_API_KEY;

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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (res.ok) {
      const j = JSON.parse(text);
      if (j.access_token) return j.access_token;
      last = '回應冇 access_token';
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

console.log('\n  ════ 2. 開賣家收款帳戶（recipient）════');
const account = await call('/api/v1/accounts/create', {
  account_details: {
    identifier: `pokemarket-probe-${Date.now()}`,
    legal_entity_type: 'INDIVIDUAL',
    primary_contact: { email: 'probe@example.com' },
    individual_details: [
      {
        first_name: 'Test',
        last_name: 'Seller',
        identification_type: 'PERSONAL_ID',
        identification_number: 'Z00000001',
      },
    ],
    customer_agreements: {
      agreed_to_terms_and_conditions: true,
      agreed_to_data_usage: true,
      agreed_to_biometrics_consent: true,
      terms_and_conditions: { service_agreement_type: 'RECIPIENT' },
    },
  },
});
const recipientId = account.body?.id;
check('開到收款帳戶', account.ok && Boolean(recipientId),
  account.ok ? `id=${recipientId}` : `HTTP ${account.status} ${String(account.raw).slice(0, 260)}`);

if (recipientId) {
  const submitted = await call(`/api/v1/accounts/${recipientId}/submit`, {});
  check('提交審批', submitted.ok || /already|invalid_state/i.test(submitted.raw),
    submitted.ok ? '已提交' : `HTTP ${submitted.status} ${String(submitted.raw).slice(0, 200)}`);

  const detail = await call(`/api/v1/accounts/${recipientId}`, undefined, 'GET');
  check('讀到帳戶狀態', detail.ok, `status=${detail.body?.status ?? '?'}`);
}

console.log('\n  ════ 3. 收款人（beneficiary）════');
const beneficiary = await call('/api/v1/beneficiaries/create', {
  beneficiary: {
    account_name: 'Test Seller',
    bank_country_code: 'HK',
    local_clearing_system: 'FPS',
    account_routing_type1: 'phone_number',
    account_routing_value1: '+852-91234567',
  },
});
const beneficiaryId = beneficiary.body?.id;
check('開到收款人', beneficiary.ok && Boolean(beneficiaryId),
  beneficiary.ok ? `id=${beneficiaryId}` : `HTTP ${beneficiary.status} ${String(beneficiary.raw).slice(0, 260)}`);

console.log('\n  ════ 4. 出款（transfer）════');
if (recipientId && beneficiaryId) {
  const transfer = await call('/api/v1/transfers/create', {
    amount: '10.00',
    currency: 'HKD',
    recipient_account_id: recipientId,
    beneficiary_id: beneficiaryId,
    reference: `PM-PROBE-${Date.now()}`,
    remarks: 'PokeMarket 賣家結算',
  });
  check('出款 request 被接受', transfer.ok && Boolean(transfer.body?.id),
    transfer.ok ? `id=${transfer.body?.id} status=${transfer.body?.status}` : `HTTP ${transfer.status} ${String(transfer.raw).slice(0, 300)}`);
} else {
  check('出款 request 被接受', false, '上面步驟失敗，冇辦法出款');
}

console.log(`\n  結果：${passed} 通過 / ${failed} 失敗\n`);
