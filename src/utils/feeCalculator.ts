/**
 * PokeMarket — Shared Fee Calculator
 * Used by both the React Native app and Cloud Functions.
 *
 * Business logic:
 * - Stripe charges: 2.9% + HK$2.35 per transaction
 * - Platform fee: PLATFORM_FEE_PERCENT of card price
 * - Total fee (Stripe + platform) is capped at ORDER_MIN_FEE_HKD minimum
 * - For micro-transactions (< ORDER_MIN_FEE_HKD), buyer pays ORDER_MIN_FEE_HKD floor
 */

import {
  PLATFORM_FEE_PERCENT,
  ORDER_MIN_FEE_HKD,
  STRIPE_PERCENT_FEE,
  STRIPE_FIXED_CENTS,
} from '../config/platform';

const ORDER_MIN_FEE_CENTS = Math.round(ORDER_MIN_FEE_HKD * 100);
const STRIPE_FIXED_HKD   = STRIPE_FIXED_CENTS / 100;  // HK$2.35

export interface FeeBreakdown {
  /** Card listing price (HKD) */
  cardPriceHkd: number;
  /** Stripe processing fee (HKD) */
  stripeFeeHkd: number;
  /** Platform fee (HKD) */
  platformFeeHkd: number;
  /** Total fee charged to buyer (HKD) */
  totalFeeHkd: number;
  /** Amount buyer pays total (card + fee) (HKD) */
  buyerTotalHkd: number;
  /** Amount seller receives net (HKD) */
  sellerNetHkd: number;
  /** Escrow required (true if card price >= ESCROW_MIN_HKD) */
  escrowRequired: boolean;
}

/**
 * Calculate full fee breakdown for a card transaction.
 * @param cardPriceHkd  Listing price in HKD
 * @returns Fee breakdown object
 */
export function calculateFee(cardPriceHkd: number): FeeBreakdown {
  const priceCents = Math.round(cardPriceHkd * 100);

  // Stripe fee (charged on buyer's total payment, which includes platform fee)
  const stripeFeeCents = Math.round(priceCents * STRIPE_PERCENT_FEE) + STRIPE_FIXED_CENTS;
  // Platform fee (on card price only)
  const platformFeeRawCents = Math.round(priceCents * PLATFORM_FEE_PERCENT);

  // Total fee floor (minimum fee regardless of transaction size)
  const totalFeeCents = Math.max(stripeFeeCents + platformFeeRawCents, ORDER_MIN_FEE_CENTS);

  // Platform fee = min(raw platform fee, total - stripe fee)
  // This ensures platform fee is never negative and total fee respects the floor
  const platformFeeCents = Math.min(platformFeeRawCents, totalFeeCents - stripeFeeCents);

  const totalFeeHkd = totalFeeCents / 100;
  const platformFeeHkd = platformFeeCents / 100;
  const stripeFeeHkd = stripeFeeCents / 100;
  const buyerTotalHkd = cardPriceHkd + totalFeeHkd;
  const sellerNetHkd = cardPriceHkd - platformFeeHkd;

  return {
    cardPriceHkd,
    stripeFeeHkd,
    platformFeeHkd,
    totalFeeHkd,
    buyerTotalHkd,
    sellerNetHkd,
    escrowRequired: cardPriceHkd >= 20,
  };
}

/**
 * Format a HKD amount for display.
 * @param amount Amount in HKD
 * @returns Formatted string e.g. "HK$ 5,320.00"
 */
export function formatHkd(amount: number): string {
  return `HK$ ${amount.toLocaleString('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
