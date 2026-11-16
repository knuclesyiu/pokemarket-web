/**
 * Airwallex — the payout rail.
 *
 * The sellers are paid by FPS out of the platform's own account rather
 * than out of a Stripe connected account. The reason is the seller
 * onboarding: Stripe will not move money to a seller it has not
 * verified, and a card seller is not going to complete fifteen KYC
 * items to be paid for a card. Airwallex's ledger model takes the
 * seller's name and a proxy ID and does the verification itself.
 *
 * The API is a plain REST API with a bearer token:
 *
 *   POST /api/v1/authentication/login   → { access_token }
 *   POST /api/v1/accounts/create        → a connected (recipient) account
 *   POST /api/v1/accounts/{id}/submit   → sends it for activation
 *   POST /api/v1/beneficiaries/create   → the seller's bank details
 *   POST /api/v1/transfers/create       → the money movement
 *
 * Sandbox: https://api.sandbox.airwallex.com
 * Live:    https://api.airwallex.com
 */

/** What a seller has to tell us to be paid by FPS. */
export interface SellerPayoutDetails {
  /** The name on the bank account. Airwallex only pays out to a
   *  beneficiary whose name matches the recipient account's name, so
   *  this has to be the real one. */
  accountName: string;
  /** How to find the account. */
  routingType:
    | 'phone_number'
    | 'email_address'
    | 'fps_identifier'
    | 'personal_id_number'
    | 'bank_code';
  /** The proxy ID itself: a phone number, an email, an FPS ID or an
   *  HKID. */
  routingValue: string;
  /** Only for `bank_code`: the account number. */
  accountNumber?: string;
}

export interface RecipientResult {
  recipientId: string;
  status: string;
}

export interface PayoutResult {
  transferId: string;
  status: string;
}

const base = () =>
  process.env.AIRWALLEX_ENV === 'production'
    ? 'https://api.airwallex.com'
    : 'https://api.sandbox.airwallex.com';

/**
 * Whether the rail can actually move money.
 *
 * The placeholder that is pushed before the real credentials arrive is
 * not a configuration: a seller must not be shown a form that will
 * fail when they fill it in.
 */
export function airwallexConfigured(): boolean {
  const clientId = process.env.AIRWALLEX_CLIENT_ID;
  const apiKey = process.env.AIRWALLEX_API_KEY;
  if (!clientId || !apiKey) return false;
  if (clientId === 'NOT_CONFIGURED' || apiKey === 'NOT_CONFIGURED') return false;
  return true;
}

/**
 * A bearer token for the client API.
 *
 * The login takes the client id and the API key. Newer Airwallex keys
 * are issued as a client id plus an API key, older ones as a client id
 * plus a client secret; both shapes are tried so the deploy does not
 * depend on which one the account was issued.
 */
async function accessToken(): Promise<string> {
  const clientId = process.env.AIRWALLEX_CLIENT_ID;
  const apiKey = process.env.AIRWALLEX_API_KEY;
  if (!clientId || !apiKey) {
    throw new Error('AIRWALLEX_CLIENT_ID / AIRWALLEX_API_KEY 未設定');
  }

  const attempts = [
    { client_id: clientId, api_key: apiKey, grant_type: 'client_credentials' },
    { client_id: clientId, client_secret: apiKey, grant_type: 'client_credentials' },
  ];

  let lastError = '';
  for (const body of attempts) {
    const res = await fetch(`${base()}/api/v1/authentication/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (res.ok) {
      try {
        const parsed = JSON.parse(text);
        if (parsed?.access_token) return parsed.access_token as string;
      } catch {
        /* fall through to the next shape */
      }
      lastError = '回應冇 access_token';
      continue;
    }
    lastError = `HTTP ${res.status}: ${text.slice(0, 200)}`;
    // A 400 here means the shape was wrong, not that the key is bad.
    if (res.status !== 400 && res.status !== 401 && res.status !== 403) break;
  }
  throw new Error(`Airwallex 登入失敗：${lastError}`);
}

async function awFetch<T = any>(
  path: string,
  body?: unknown,
  method: 'POST' | 'GET' = 'POST',
): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`${base()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Airwallex ${path} → HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Airwallex ${path} 回應唔係 JSON：${text.slice(0, 200)}`);
  }
}

/**
 * The seller's recipient account.
 *
 * A connected account with a RECIPIENT service agreement is what
 * Airwallex's marketplace model expects: the platform splits the money
 * into it and pays out of it. Light screening, not full KYB — that is
 * the point of not using Stripe here.
 */
export async function createRecipient(
  uid: string,
  email: string,
  details: SellerPayoutDetails,
): Promise<RecipientResult> {
  const [given, ...rest] = details.accountName.trim().split(/\s+/);
  const created = await awFetch<any>('/api/v1/accounts/create', {
    account_details: {
      identifier: `pokemarket-${uid}`,
      legal_entity_type: 'INDIVIDUAL',
      primary_contact: { email },
      individual_details: [
        {
          first_name: given,
          last_name: rest.join(' ') || given,
          identification_type: 'PERSONAL_ID',
          identification_number: details.routingType === 'personal_id_number'
            ? details.routingValue
            : undefined,
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

  const recipientId = created?.id;
  if (!recipientId) {
    throw new Error(`Airwallex 開賣家收款帳戶失敗：${JSON.stringify(created).slice(0, 300)}`);
  }

  // An account that is not active cannot receive a transfer, and an
  // account that has not been submitted never becomes active.
  try {
    await awFetch(`/api/v1/accounts/${recipientId}/submit`, {});
  } catch (err: any) {
    // Submitting twice is not fatal — the account is already in
    // review — so a failure here is only worth reporting if it means
    // the account never got off the ground.
    if (!/already|invalid_state|not_found/i.test(String(err?.message ?? ''))) {
      throw err;
    }
  }

  const status = await recipientStatus(recipientId);
  return { recipientId, status };
}

export async function recipientStatus(recipientId: string): Promise<string> {
  const account = await awFetch<any>(`/api/v1/accounts/${recipientId}`, undefined, 'GET');
  return String(account?.status ?? account?.account_status ?? 'unknown');
}

/** The seller's bank details, stored once and reused for every payout. */
export async function createBeneficiary(
  details: SellerPayoutDetails,
): Promise<string> {
  const beneficiary = await awFetch<any>('/api/v1/beneficiaries/create', {
    beneficiary: {
      account_name: details.accountName,
      bank_country_code: 'HK',
      local_clearing_system: 'FPS',
      account_routing_type1: details.routingType,
      account_routing_value1: details.routingValue,
      ...(details.routingType === 'bank_code' && details.accountNumber
        ? { account_number: details.accountNumber }
        : {}),
    },
  });
  const id = beneficiary?.id;
  if (!id) {
    throw new Error(`Airwallex 開收款人失敗：${JSON.stringify(beneficiary).slice(0, 300)}`);
  }
  return id;
}

/** Move the money. */
export async function createTransfer(args: {
  recipientAccountId: string;
  beneficiaryId: string;
  amountHkd: number;
  reference: string;
  description: string;
}): Promise<PayoutResult> {
  const transfer = await awFetch<any>('/api/v1/transfers/create', {
    amount: args.amountHkd.toFixed(2),
    currency: 'HKD',
    recipient_account_id: args.recipientAccountId,
    beneficiary_id: args.beneficiaryId,
    reference: args.reference,
    remarks: args.description,
    client_data: args.reference,
  });
  const transferId = transfer?.id;
  if (!transferId) {
    throw new Error(`Airwallex 出款失敗：${JSON.stringify(transfer).slice(0, 300)}`);
  }
  return { transferId, status: String(transfer?.status ?? 'unknown') };
}
