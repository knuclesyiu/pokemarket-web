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
