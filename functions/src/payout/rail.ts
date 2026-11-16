import { airwallexConfigured } from './airwallex';

export type PayoutRailName = 'airwallex' | 'stripe';

/**
 * Which rail pays the sellers.
 *
 * Airwallex is the default once it is configured: it is the rail that
 * does not need the seller to complete a KYC form. Stripe stays
 * available behind `PAYOUT_RAIL=stripe` because it is the rail that
 * is already live, and because a platform that pays out of its own
 * account is a different regulatory shape from one that holds the
 * money in a connected account.
 */
export function payoutRail(): PayoutRailName {
  const configured = (process.env.PAYOUT_RAIL ?? '').toLowerCase();
  if (configured === 'stripe' || configured === 'airwallex') return configured;
  return airwallexConfigured() ? 'airwallex' : 'stripe';
}
