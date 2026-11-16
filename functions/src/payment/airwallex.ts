/**
 * Airwallex — taking the buyer's money.
 *
 * The model is the same as Stripe's, which is the reason the escrow
 * ports across without changing shape: the server creates a payment
 * intent, the client confirms it with the client secret, and a webhook
 * says it succeeded.
 *
 *   POST /api/v1/pa/payment_intents/create
 *     amount             — in minor units
 *     currency           — HKD
 *     merchant_order_id  — our order id
 *     request_id         — our own unique id, so a retry is not a
 *                          second charge
 *
 * The client secret is what the client uses to confirm the payment;
 * it never sees an API key.
 */

import { airwallexFetch } from '../shared/airwallex';

export interface CollectionIntent {
  paymentIntentId: string;
  clientSecret: string;
  status: string;
}

export async function createCollectionIntent(args: {
  amountHkd: number;
  merchantOrderId: string;
  requestId: string;
  metadata?: Record<string, string>;
  sellerId?: string;
  buyerId?: string;
}): Promise<CollectionIntent> {
  const intent = await airwallexFetch<any>('/api/v1/pa/payment_intents/create', {
    amount: Math.round(args.amountHkd * 100),
    currency: 'HKD',
    merchant_order_id: args.merchantOrderId,
    request_id: args.requestId,
    ...(args.metadata ? { metadata: args.metadata } : {}),
    // The order block is what Airwallex's risk system reads for a
    // marketplace. Both ids are ours; neither is a price.
    ...(args.sellerId || args.buyerId
      ? {
          order: {
            type: 'goods',
            ...(args.sellerId
              ? { sellers: [{ identifier: args.sellerId, name: 'seller' }] }
              : {}),
          },
        }
      : {}),
  });

  const paymentIntentId = intent?.id;
  const clientSecret = intent?.client_secret;
  if (!paymentIntentId || !clientSecret) {
    throw new Error(
      `Airwallex 開收款單失敗：${JSON.stringify(intent).slice(0, 300)}`,
    );
  }
  return {
    paymentIntentId,
    clientSecret,
    status: String(intent?.status ?? 'REQUIRES_PAYMENT_METHOD'),
  };
}

export async function retrieveIntent(paymentIntentId: string): Promise<any> {
  return airwallexFetch<any>(
    `/api/v1/pa/payment_intents/${paymentIntentId}`,
    undefined,
    'GET',
  );
}

export async function cancelIntent(paymentIntentId: string): Promise<void> {
  try {
    await airwallexFetch(`/api/v1/pa/payment_intents/${paymentIntentId}/cancel`, {});
  } catch {
    // Cancelling an intent that is already cancelled is not a problem.
  }
}

/** The money back to the buyer. */
export async function refundPayment(
  paymentIntentId: string,
  amountHkd: number,
  reason?: string,
): Promise<string> {
  const refund = await airwallexFetch<any>('/api/v1/pa/refunds/create', {
    payment_intent_id: paymentIntentId,
    amount: Math.round(amountHkd * 100),
    currency: 'HKD',
    reason: reason ?? 'requested_by_customer',
  });
  const refundId = refund?.id;
  if (!refundId) {
    throw new Error(`Airwallex 退款失敗：${JSON.stringify(refund).slice(0, 300)}`);
  }
  return refundId;
}
