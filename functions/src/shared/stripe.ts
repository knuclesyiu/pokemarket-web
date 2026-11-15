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
