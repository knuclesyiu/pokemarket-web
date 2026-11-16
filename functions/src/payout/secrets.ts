import { defineSecret } from 'firebase-functions/params';

/**
 * The Airwallex client id and API key.
 *
 * They live in Secret Manager, not in the repo and not in a plain
 * environment variable: `firebase functions:secrets:set` alone does
 * not bind a secret to the code, the function has to declare it.
 */
export const airwallexClientId = defineSecret('AIRWALLEX_CLIENT_ID');
export const airwallexApiKey = defineSecret('AIRWALLEX_API_KEY');
/**
 * The webhook signing secret.
 *
 * Airwallex signs each event with the HMAC-SHA256 of the timestamp and
 * the body. Without this the handler accepts unsigned events and says
 * so in the log — better than refusing every delivery when a deploy
 * has not been given the secret yet.
 */
export const airwallexWebhookSecret = defineSecret('AIRWALLEX_WEBHOOK_SECRET');
