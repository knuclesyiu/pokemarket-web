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
import {
  airwallexConfigured,
  airwallexFetch as awFetch,
} from '../shared/airwallex';

export { airwallexConfigured };

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
  // The shape Airwallex's own API reference documents: the individual
  // details sit inside `account_details` as an object, while the
  // contact and the agreements sit at the top level of the request.
  const created = await awFetch<any>('/api/v1/accounts/create', {
    account_details: {
      legal_entity_type: 'INDIVIDUAL',
      individual_details: {
        first_name: given,
        last_name: rest.join(' ') || given,
        identification_type: 'PERSONAL_ID',
        identification_number:
          details.routingType === 'personal_id_number'
            ? details.routingValue
            : undefined,
      },
    },
    customer_agreements: {
      agreed_to_biometrics_consent: true,
      agreed_to_data_usage: true,
      agreed_to_terms_and_conditions: true,
      opt_in_for_marketing: false,
      terms_and_conditions: { service_agreement_type: 'RECIPIENT' },
    },
    identifier: `pokemarket-${uid}`,
    nickname: `PokeMarket ${uid.slice(0, 8)}`,
    primary_contact: { email, mobile: details.routingValue },
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
      entity_type: 'PERSONAL',
      account_name: details.accountName,
      transfer_methods: ['FPS'],
      bank_details: {
        account_currency: 'HKD',
        bank_country_code: 'HK',
        local_clearing_system: 'FPS',
        account_routing_type1: details.routingType,
        account_routing_value1: details.routingValue,
        ...(details.routingType === 'bank_code' && details.accountNumber
          ? { account_number: details.accountNumber }
          : {}),
      },
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
