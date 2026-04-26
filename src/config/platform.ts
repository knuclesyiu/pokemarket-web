/**
 * PokeMarket — Platform Configuration
 *
 * Adjust these 2 parameters to tune the business model:
 *   PLATFORM_FEE_PERCENT  — platform fee rate (0.03 = 3%)
 *   ORDER_MIN_FEE_HKD    — minimum total fee (Stripe + platform) in HKD
 *
 * These are also available as environment variables:
 *   EXPO_PUBLIC_PLATFORM_FEE_PERCENT
 *   EXPO_PUBLIC_ORDER_MIN_FEE_HKD
 * (env vars take precedence over values here)
 */

// ─── FEE CONFIGURATION ────────────────────────────────────────────────────────
// Adjust these to change the business model

/** Platform fee as a decimal (0.03 = 3%) */
export const PLATFORM_FEE_PERCENT = parseFloat(
  process.env.EXPO_PUBLIC_PLATFORM_FEE_PERCENT ?? '0.03'
);

/** Minimum total fee (Stripe 2.9% + HK$2.35 + platform fee) in HKD */
export const ORDER_MIN_FEE_HKD = parseFloat(
  process.env.EXPO_PUBLIC_ORDER_MIN_FEE_HKD ?? '20'
);

// ─── CONSTANTS (do not adjust) ──────────────────────────────────────────────
export const STRIPE_PERCENT_FEE = 0.029;   // Stripe: 2.9%
export const STRIPE_FIXED_CENTS = 235;     // Stripe: HK$2.35 per charge
export const ESCROW_MIN_HKD    = 20;     // Escrow enabled for listings >= HK$20
