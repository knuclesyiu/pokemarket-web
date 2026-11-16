import { airwallexConfigured } from '../shared/airwallex';
import type { PaymentRail } from '../shared/feeCalculator';

/**
 * Which processor takes the buyer's money.
 *
 * Airwallex is the default once it is configured, for the same reason
 * it is the default for payouts: it is the rail that does not make the
 * seller fill in a KYC form, and it can take FPS, which Stripe cannot
 * do in Hong Kong at all.
 *
 * The two rails have to agree. The buyer pays the platform's processor
 * and the platform pays the seller out of its own Airwallex balance,
 * so if the two are different providers the money has to cross between
 * them — a day of settlement, and a float the platform has to carry.
 */
export function paymentRail(): PaymentRail {
  const configured = (process.env.PAYMENT_RAIL ?? '').toLowerCase();
  if (configured === 'stripe' || configured === 'airwallex') return configured;
  return airwallexConfigured() ? 'airwallex' : 'stripe';
}
