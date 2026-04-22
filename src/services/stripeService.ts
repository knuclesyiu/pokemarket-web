/**
 * PokeMarket — Stripe Service
 * Wraps Firebase Cloud Functions with Stripe SDK calls from React Native
 *
 * Usage:
 *   import { createPayment, confirmReceipt, raiseDispute } from '@/services/stripeService';
 */

import { functions } from "@/services/firebase"; // Firebase app config
import { getFunctions, httpsCallable } from "firebase/functions";
import { Stripe, loadStripe } from "@stripe/stripe-react-native";

// ─── Stripe instance ───────────────────────────────────────────────────────────

let stripePromise: ReturnType<typeof loadStripe> | null = null;

export function getStripe(publishableKey: string) {
  if (!stripePromise) {
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreatePaymentParams {
  orderId: string;
  amountHkd: number;
  sellerId: string;
  deliveryMethod: "meetup" | "sf";
  cardName: string;
  cardId: string;
}

export interface ConfirmPaymentParams {
  paymentIntentId: string;
}

export interface ReleasePaymentParams {
  orderId: string;
  sellerStripeAccountId: string;
}

export interface RefundParams {
  orderId: string;
  reason: string;
}

export interface OnboardingParams {
  sellerId: string;
  email: string;
}

// ─── Firebase Function Call Helpers ──────────────────────────────────────────

async function callFunction<T>(name: string, data: object): Promise<T> {
  const fns = getFunctions();
  const func = httpsCallable(fns, name, { timeout: 30000 });
  const result = await func(data);
  return result.data as T;
}

// ─── API Functions ────────────────────────────────────────────────────────────

/**
 * Step 1: Create a PaymentIntent with escrowed funds
 * Called from CheckoutScreen when buyer taps "Confirm Payment"
 */
export async function createEscrowPayment(params: CreatePaymentParams) {
  return callFunction<{
    clientSecret: string;
    paymentIntentId: string;
    amount: number;
    platformFee: number;
    sellerNet: number;
  }>("createPaymentIntent", params);
}

/**
 * Step 2: Buyer confirms payment completed
 * For FPS: buyer confirms they transferred money
 * For Card: use Stripe SDK to confirm
 */
export async function confirmPayment(params: ConfirmPaymentParams) {
  return callFunction<{ success: boolean; status: string; orderId: string }>(
    "confirmPayment",
    params
  );
}

/**
 * Step 3: Buyer confirms receipt of card → release funds to seller
 * Called from OrderStatusScreen "確認收貨" button
 */
export async function releaseFundsToSeller(params: ReleasePaymentParams) {
  return callFunction<{
    success: boolean;
    transferId: string;
    amountTransferred: number;
    orderId: string;
  }>("releasePayment", params);
}

/**
 * Dispute: Buyer raises issue before confirming
 * Refunds buyer if funds still in escrow
 */
export async function raiseDispute(params: RefundParams) {
  return callFunction<{ success: boolean; refundId?: string; cancelled?: boolean }>(
    "refundPayment",
    params
  );
}

/**
 * Seller onboarding: Create Stripe Connect Express account
 * Returns onboarding URL to redirect seller to Stripe's hosted page
 */
export async function startSellerOnboarding(params: OnboardingParams) {
  return callFunction<{ onboardingUrl: string; accountId: string }>(
    "createSellerAccount",
    params
  );
}

/**
 * Check if seller has completed Stripe onboarding
 */
export async function checkSellerOnboarding() {
  return callFunction<{
    onboarded: boolean;
    accountId: string | null;
    onboardingUrl: string | null;
  }>("getSellerOnboardingStatus", {});
}

/**
 * Seller withdrawal: Transfer balance to seller's bank
 */
export async function createWithdrawal(amountHkd: number, sellerStripeAccountId: string) {
  return callFunction<{ success: boolean; payoutId: string; status: string }>(
    "createWithdrawal",
    { amountHkd, sellerStripeAccountId }
  );
}

// ─── Stripe SDK Card Payment (alternative to FPS) ──────────────────────────────

/**
 * Use Stripe SDK to collect and confirm card payment
 * Call this after createEscrowPayment() gets a clientSecret
 */
export async function confirmCardPayment(
  clientSecret: string,
  card: {
    number: string;
    expMonth: number;
    expYear: number;
    cvc: string;
  }
) {
  const stripe = await getStripe(
    "pk_live_51TOvo2A6TKHCOKSebqDl5Qkrmy3zTOxbZSbFruIsM5LhWtfpW3rAcUpq80UEgxFGGBtXWsYHZsoCuCLwkPMpiI10008O8pzjB4"
  );

  if (!stripe) {
    throw new Error("Stripe not loaded");
  }

  const { error, paymentIntent } = await stripe.confirmPayment(clientSecret, {
    paymentMethodType: "Card",
    paymentMethodData: {
      card: {
        number: card.number,
        expMonth: card.expMonth,
        expYear: card.expYear,
        cvc: card.cvc,
      },
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  return paymentIntent;
}

// ─── Order Status Polling ──────────────────────────────────────────────────────

/**
 * Poll order status from Firestore until it reaches a target status.
 * Used after payment to wait for webhook confirmation.
 */
export async function pollOrderStatus(
  orderId: string,
  targetStatuses: string[],
  maxAttempts = 20,
  intervalMs = 2000
): Promise<string> {
  // Use Firebase real-time listener instead of polling if possible
  // This is a fallback for simpler integration
  for (let i = 0; i < maxAttempts; i++) {
    const fns = getFunctions();
    const getOrder = httpsCallable(fns, "getOrderStatus", { timeout: 10000 });
    const result = await getOrder({ orderId });
    const status = (result.data as { status: string }).status;

    if (targetStatuses.includes(status)) {
      return status;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Order ${orderId} did not reach status ${targetStatuses.join(" or ")}`);
}
