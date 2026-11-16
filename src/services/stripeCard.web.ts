/**
 * Stripe card payment — WEB implementation.
 *
 * Metro picks this file for web and `stripeCard.ts` for iOS/Android
 * (platform-specific extension resolution). The native Stripe SDK
 * imports react-native internals and cannot be bundled for web, so the
 * two implementations must stay in separate files.
 *
 * `@stripe/stripe-js` is only a loader: it injects stripe.js v3 from
 * the Stripe CDN at runtime and hands back the same `Stripe` object the
 * native SDK exposes.
 *
 * stripe.js v10 (like every modern Stripe SDK) will NOT accept raw card
 * numbers — the card must be collected by Stripe's own `<CardElement />`
 * (see `src/components/CardPaymentForm.web.tsx`) and turned into a
 * PaymentMethod by Stripe.js. The old `src/types/stripe-stub.d.ts`
 * invented an API that never existed, which is why the web build could
 * not bundle at all.
 */
import { t } from '../i18n';
import { loadStripe } from "@stripe/stripe-js";
import type { CardDetails, StripeCardResult } from "../types/stripe";

/**
 * Read the publishable key from EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY.
 * Defined in .env (see .env.example). Never hardcode in source.
 */
export const STRIPE_PUBLISHABLE_KEY: string =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

let stripePromise: ReturnType<typeof loadStripe> | null = null;

/**
 * Lazily load Stripe.js with the publishable key from env.
 * Throws a clear error if the env var is missing.
 */
function getStripe(): Promise<ReturnType<typeof loadStripe> extends Promise<infer T> ? T : never> {
  if (!STRIPE_PUBLISHABLE_KEY) {
    throw new Error(
      "Missing EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY. Set it in your .env (see .env.example)."
    );
  }
  if (!stripePromise) {
    stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
  }
  return stripePromise as any;
}

/**
 * Confirm a card payment against a PaymentIntent client secret.
 *
 * `card.getPaymentMethodId` builds a PaymentMethod from the Stripe
 * `<CardElement />` the user filled in; we then attach it to the
 * PaymentIntent and confirm.
 */
export async function confirmCardPayment(
  clientSecret: string,
  card: CardDetails,
): Promise<StripeCardResult> {
  const stripe = await getStripe();
  if (!stripe) {
    throw new Error("Stripe not loaded");
  }

  const paymentMethodId = await card.getPaymentMethodId?.();
  if (!paymentMethodId) {
    throw new Error(t('請先填寫信用卡資料'));
  }

  const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
    payment_method: paymentMethodId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return { paymentIntentId: paymentIntent?.id };
}
