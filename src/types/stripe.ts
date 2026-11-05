/**
 * Shared Stripe card-payment types.
 *
 * Kept in its own file (no imports) so both the native and the web
 * implementation of `confirmCardPayment` can reference it without
 * pulling one platform's Stripe SDK into the other's bundle.
 */

/**
 * Card details, as the platform-specific card input can provide them.
 *
 * Modern Stripe SDKs refuse raw card numbers: the card must be collected
 * by Stripe's own input element and turned into a PaymentMethod by
 * Stripe itself. So instead of raw card data we pass a factory that
 * returns a PaymentMethod id.
 */
export interface CardDetails {
  /**
   * Creates a PaymentMethod from the card the user entered.
   * Returns the PaymentMethod id, or null if the card was not filled in.
   *
   * On web this uses Stripe's `<CardElement />`. On native the app has
   * no card input yet, so it rejects with an explanatory error.
   */
  getPaymentMethodId?: () => Promise<string | null>;
}

export interface StripeCardResult {
  /** Stripe PaymentIntent id — matches the id the server created. */
  paymentIntentId?: string;
}
