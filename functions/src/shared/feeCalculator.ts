/**
 * Shared fee calculator — duplicated from client-side to keep the
 * server as the source of truth.
 *
 * IMPORTANT: keep in sync with src/utils/feeCalculator.ts.
 *   - PLATFORM_FEE_PERCENT: 0.03 (3%)
 *   - STRIPE_PERCENT_FEE: 0.029 (2.9%)
 *   - STRIPE_FIXED_CENTS: 235 (HK$2.35)
 *   - ORDER_MIN_FEE_HKD: 20
 *   - ESCROW_MIN_HKD: 20
 *
 * For high-traffic production, import from a shared package.
 */

export const PLATFORM_FEE_PERCENT = 0.03;
export const STRIPE_PERCENT_FEE = 0.029;
export const AIRWALLEX_PERCENT_FEE = 0.033;
export const STRIPE_FIXED_CENTS = 235;

/**
 * Which processor takes the buyer's money.
 *
 * The percentage is the processor's published rate, not a guess: the
 * platform's fee has to cover what the processor actually charges, or
 * every transaction quietly costs the platform money.
 */
export type PaymentRail = 'stripe' | 'airwallex';

export function processorPercentFee(rail: PaymentRail): number {
  const override = Number(process.env[`${rail.toUpperCase()}_PERCENT_FEE`]);
  if (Number.isFinite(override) && override > 0) return override;
  return rail === 'airwallex' ? AIRWALLEX_PERCENT_FEE : STRIPE_PERCENT_FEE;
}
export const ORDER_MIN_FEE_HKD = 20;
export const ESCROW_MIN_HKD = 20;

export interface FeeBreakdown {
  cardPriceHkd: number;
  stripeFeeHkd: number;
  platformFeeHkd: number;
  totalFeeHkd: number;
  buyerTotalHkd: number;
  sellerNetHkd: number;
  escrowRequired: boolean;
}

export function calculateFee(
  cardPriceHkd: number,
  rail: PaymentRail = 'stripe',
): FeeBreakdown {
  const priceCents = Math.round(cardPriceHkd * 100);
  const stripeFeeCents =
    Math.round(priceCents * processorPercentFee(rail)) + STRIPE_FIXED_CENTS;
  const platformFeeRawCents = Math.round(priceCents * PLATFORM_FEE_PERCENT);
  const totalFeeCents = Math.max(stripeFeeCents + platformFeeRawCents, ORDER_MIN_FEE_HKD * 100);
  const platformFeeCents = Math.min(platformFeeRawCents, totalFeeCents - stripeFeeCents);
  const totalFeeHkd = totalFeeCents / 100;
  const platformFeeHkd = platformFeeCents / 100;
  const stripeFeeHkd = stripeFeeCents / 100;
  return {
    cardPriceHkd,
    /** The processor's fee. Named for Stripe because that is what the
     *  rest of the code calls it; it is the rail's fee either way. */
    stripeFeeHkd,
    platformFeeHkd,
    totalFeeHkd,
    buyerTotalHkd: cardPriceHkd + totalFeeHkd,
    sellerNetHkd: cardPriceHkd - platformFeeHkd,
    escrowRequired: cardPriceHkd >= ESCROW_MIN_HKD,
  };
}
