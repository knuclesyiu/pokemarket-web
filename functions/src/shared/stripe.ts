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
    throw new Error(
      'STRIPE_SECRET_KEY 未設定 — 用 functions/.env 或者部署時嘅 secret 綁定',
    );
  }
  if (!client) {
    client = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
  }
  return client;
}
