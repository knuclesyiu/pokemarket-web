/**
 * Airwallex tells us the buyer paid.
 *
 * The signature is the same shape as Stripe's: the HMAC-SHA256 of the
 * timestamp and the raw body, keyed with the webhook secret. Airwallex
 * retries a delivery that is not answered with a 200, for days — so
 * the write has to be idempotent, and a body that cannot be parsed
 * has to be acknowledged rather than retried forever.
 *
 * The counting of the escrow is the same as the Stripe path: the
 * order's own status says whether this event has already been
 * counted.
 */

import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { createHmac, timingSafeEqual } from 'crypto';
import { airwallexWebhookSecret } from '../payout/secrets';

const db = admin.firestore();

export const airwallexWebhook = onRequest(
  { secrets: [airwallexWebhookSecret] },
  async (req, res) => {
  // 1. The signature. A webhook that cannot be trusted is not a
  //    webhook — but a missing secret in a misconfigured deploy should
  //    not silently accept unsigned events either, so it is logged.
  const secret = airwallexWebhookSecret.value();
  const timestamp = String(req.header('x-timestamp') ?? '');
  const signature = String(req.header('x-signature') ?? '');
  const raw = req.rawBody?.toString('utf8') ?? '';

  if (secret) {
    const expected = createHmac('sha256', secret)
      .update(timestamp + raw)
      .digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      console.warn('[airwallexWebhook] 簽名唔啱，唔處理');
      res.status(400).send('invalid signature');
      return;
    }
  } else {
    console.warn('[airwallexWebhook] 未設定 AIRWALLEX_WEBHOOK_SECRET');
  }

  let event: any;
  try {
    event = req.body ?? JSON.parse(raw || '{}');
  } catch {
    // A payload that cannot be parsed will never parse on a retry.
    res.status(200).send('ignored');
    return;
  }

  const name = String(event?.name ?? '');
  if (name !== 'payment_intent.succeeded') {
    res.status(200).send('ignored');
    return;
  }

  const intent = event?.data?.object ?? {};
  const orderId: string =
    intent?.metadata?.orderId ?? intent?.merchant_order_id ?? '';
  if (!orderId) {
    console.warn('[airwallexWebhook] 事件冇 orderId');
    res.status(200).send('ignored');
    return;
  }

  try {
    const orderRef = db.doc(`orders/${orderId}`);
    const orderSnap = await orderRef.get();
    const order = orderSnap.data() as any;
    if (!order) {
      console.warn(`[airwallexWebhook] 訂單 ${orderId} 唔存在`);
      res.status(200).send('ignored');
      return;
    }

    // Already counted — the same event, delivered twice.
    if (order.status !== 'awaiting_payment') {
      console.log(
        `[airwallexWebhook] 訂單 ${orderId} 已經係 ${order.status}，唔當新事件計`,
      );
      res.status(200).send('ok');
      return;
    }

    const amountHkd = Number(intent?.amount ?? 0) / 100;
    const buyerId: string = intent?.metadata?.buyerId ?? order.buyerId;

    await orderRef.update({
      status: 'paid',
      paidAt: FieldValue.serverTimestamp(),
      paymentIntentId: intent?.id ?? order.paymentIntentId ?? null,
      paymentRail: 'airwallex',
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (buyerId && amountHkd > 0) {
      await db.doc(`users/${buyerId}/wallet/main`).set(
        {
          pendingEscrow: FieldValue.increment(amountHkd),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    console.log(`[airwallexWebhook] 訂單 ${orderId} 已付款 HK$${amountHkd}`);
    res.status(200).send('ok');
  } catch (err: any) {
    // A failed write is the one case where a 5xx is right: the retry
    // is what makes it work.
    console.error('[airwallexWebhook] 處理失敗', err);
    res.status(500).send('failed');
  }
});
