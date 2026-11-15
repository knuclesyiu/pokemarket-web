/**
 * The Stripe client, built when it is needed rather than when the
 * module is loaded.
 *
 * `new Stripe('')` throws — it has no authenticator. When that
 * happened at module scope it took the whole functions bundle down
 * with it: the emulator could not load any function, and every
 * callable came back `not-found`. Twenty-five functions that have
 * nothing to do with Stripe went down because three of them needed a
 * key that was not there.
 *
 * Building the client inside the handler means a missing key fails
 * one call with a message that says what is missing, and leaves
 * everything else working.
 */

import Stripe from 'stripe';
import { HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';

/**
 * The Stripe credentials, declared rather than merely set.
 *
 * `firebase functions:secrets:set` puts the value in Secret Manager,
 * but on its own that does not bind it to anything: the secret only
 * reaches a function that declares it and asks for it. Without the
 * declaration the secret sits in the project unused and every call
 * reports that Stripe is not configured, while the dashboard shows
 * the secret right there.
 *
 * Only the functions that touch Stripe ask for these. The public
 * price sync does not, so it does not get the key.
 */
export const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
export const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');

/** Matches the version the installed Stripe package expects. */
export const STRIPE_API_VERSION = '2025-02-24.acacia';

let client: Stripe | null = null;

/**
 * The Stripe client, or a thrown error naming the missing key.
 *
 * The key is read from the environment, which is how Cloud Functions
 * provides it. A secret bound with `defineSecret` is not in the
 * environment at load time, so read it inside the handler.
 */
export function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    // A plain Error reaches the client as `functions/internal` with
    // the message "INTERNAL" — the user learns nothing. An HttpsError
    // carries the reason through.
    throw new HttpsError(
      'failed-precondition',
      'Stripe 收款服務未設定。需要用 firebase functions:secrets:set STRIPE_SECRET_KEY 綁定金鑰。',
    );
  }
  if (!client) {
    client = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
  }
  return client;
}

/**
 * The v2 API, for the endpoints the SDK does not cover.
 *
 * A connected account has to be created with the Accounts v2 API. The
 * v1 request for a transfer capability — `capabilities[transfers]
 * [requested]=true` — is dropped without a complaint on a marketplace
 * platform: the account comes back with the capability `inactive` and
 * nothing says why, and the refusal only surfaces later as a
 * transfer error. The v2 API asks for the same thing the way a
 * marketplace should: a `recipient` configuration carrying the
 * `stripe_balance.stripe_transfers` capability, with the platform
 * holding the fees and the losses.
 *
 * The v2 endpoints are versioned apart from v1 and refuse to answer
 * without a version header, so the version is sent explicitly.
 */
export const STRIPE_V2_API_VERSION = '2026-03-25.dahlia';

/**
 * Call a Stripe v2 endpoint.
 *
 * The body is JSON, the path is absolute from the API root, and a
 * failure is raised as an `HttpsError` so the reason reaches the
 * caller instead of arriving as `functions/internal`.
 */
export async function stripeV2<T = Record<string, unknown>>(
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new HttpsError('failed-precondition', 'Stripe 收款服務未設定。');
  }
  const res = await fetch(`https://api.stripe.com${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Stripe-Version': STRIPE_V2_API_VERSION,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  if (!res.ok) {
    throw new HttpsError(
      'internal',
      `Stripe v2 ${path} 失敗：${json?.error?.message ?? `HTTP ${res.status}`}`,
    );
  }
  return json as T;
}

/**
 * The state of a connected account's money capabilities.
 *
 * A seller is ready when they can hold a Stripe balance, receive
 * transfers into it, and have that balance paid out to their bank —
 * which is what the `stripe_balance` capabilities say.
 */
export type RecipientCapabilities = {
  stripe_transfers?: { status?: string };
  payouts?: { status?: string };
};

export function recipientCapabilities(
  account: any,
): RecipientCapabilities {
  return (
    account?.configuration?.recipient?.capabilities?.stripe_balance ?? {}
  );
}
