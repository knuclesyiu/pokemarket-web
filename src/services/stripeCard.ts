/**
 * Stripe card payment — NATIVE implementation.
 *
 * Metro picks this file for iOS/Android and `stripeCard.web.ts` for web
 * (platform-specific extension resolution). The native Stripe SDK cannot
 * be bundled for web — it imports react-native internals — so the two
 * implementations must stay in separate files.
 *
 * IMPORTANT — why native card payment is not implemented here:
 *
 * The CheckoutScreen collects raw card fields (number / expiry / cvc) in
 * plain TextInputs. That was written against a fictional Stripe API: the
 * `src/types/stripe-stub.d.ts` file that used to declare this module
 * invented a `loadStripe(key)` export and a `confirmPayment` that took
 * raw card details. The real `@stripe/stripe-react-native` v0.45 has
 * NEITHER — it has no `loadStripe` export at all, and its `createToken`
 * / `createPaymentMethod` params deliberately exclude raw card data.
 * Modern Stripe SDKs only accept raw card details through their own
 * secure native input component (`<CardForm>`), which the app does not
 * use yet. So on native, the old code would have crashed at runtime with
 * "loadStripe is not a function" — the stub only hid it from the
 * compiler.
 *
 * Rather than keep a fiction, the native path fails loudly and points
 * the buyer at FPS (轉數快), which is the primary HK payment method in
 * the app and needs no card SDK at all.
 *
 * To enable native card payments later:
 *   1. Wrap the app in `<StripeProvider publishableKey={...}>`.
 *   2. Replace the card TextInputs with `<CardForm onFormComplete={...} />`.
 *   3. `createPaymentMethod({ paymentMethodType: 'Card',
 *        paymentMethodData: { token } })` → paymentMethodId.
 *   4. `confirmPayment(clientSecret, { paymentMethodType: 'Card',
 *        paymentMethodData: { paymentMethodId } })`.
 *
 * Usage:
 *   const { paymentIntentId } = await confirmCardPayment(clientSecret, card);
 */
import { t } from '../i18n';
import type { CardDetails, StripeCardResult } from "../types/stripe";

/**
 * Read the publishable key from EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY.
 * Defined in .env (see .env.example). Never hardcode in source.
 */
export const STRIPE_PUBLISHABLE_KEY: string =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

/**
 * Confirm a card payment against a PaymentIntent client secret.
 *
 * NOT SUPPORTED ON NATIVE YET — see the note at the top of this file.
 * Throws a clear, actionable error so the buyer is never left guessing.
 */
export async function confirmCardPayment(
  _clientSecret: string,
  _card: CardDetails,
): Promise<StripeCardResult> {
  throw new Error(
    t('手機版暫時未支援信用卡付款。請改用「FPS 轉數快」付款，') +
      t('或者用網頁版完成呢筆交易。')
  );
}
