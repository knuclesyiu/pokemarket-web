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
export const STRIPE_FIXED_CENTS = 235;
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

export function calculateFee(cardPriceHkd: number): FeeBreakdown {
  const priceCents = Math.round(cardPriceHkd * 100);
  const stripeFeeCents = Math.round(priceCents * STRIPE_PERCENT_FEE) + STRIPE_FIXED_CENTS;
  const platformFeeRawCents = Math.round(priceCents * PLATFORM_FEE_PERCENT);
  const totalFeeCents = Math.max(stripeFeeCents + platformFeeRawCents, ORDER_MIN_FEE_HKD * 100);
  const platformFeeCents = Math.min(platformFeeRawCents, totalFeeCents - stripeFeeCents);
  const totalFeeHkd = totalFeeCents / 100;
  const platformFeeHkd = platformFeeCents / 100;
  const stripeFeeHkd = stripeFeeCents / 100;
  return {
    cardPriceHkd,
    stripeFeeHkd,
    platformFeeHkd,
    totalFeeHkd,
    buyerTotalHkd: cardPriceHkd + totalFeeHkd,
    sellerNetHkd: cardPriceHkd - platformFeeHkd,
    escrowRequired: cardPriceHkd >= ESCROW_MIN_HKD,
  };
}
