/**
 * What the client needs to know to take a payment.
 *
 * The client must not choose the rail, and it must not carry a
 * processor's secret. It asks the server which rail is live and gets
 * back the public identifier for it.
 */

import * as functions from 'firebase-functions/v2/https';
import { paymentRail } from './rail';
import { airwallexConfigured } from '../shared/airwallex';

export const getPaymentConfig = functions.onCall(async () => {
  const rail = paymentRail();
  if (rail === 'airwallex') {
    return {
      rail,
      configured: airwallexConfigured(),
      // The client id is public — it identifies the merchant, it does
      // not authorise anything. The secret key never leaves the server.
      clientId: airwallexConfigured() ? process.env.AIRWALLEX_CLIENT_ID : null,
      environment:
        process.env.AIRWALLEX_ENV === 'production' ? 'production' : 'sandbox',
      currency: 'HKD',
      countryCode: 'HK',
    };
  }
  return {
    rail,
    configured: true,
    clientId: null,
    environment: 'production',
    currency: 'HKD',
    countryCode: 'HK',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null,
  };
});
