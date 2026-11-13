/**
 * Stripe webhook — receives events and updates order state.
 *
 * Setup in Stripe dashboard:
 *   1. Developers → Webhooks → Add endpoint
 *   2. URL: https://us-central1-pokemarket-255c6.cloudfunctions.net/stripeWebhook
 *   3. Events to send: payment_intent.succeeded, payment_intent.payment_failed,
 *      charge.refunded, transfer.created
 *   4. Copy the signing secret to STRIPE_WEBHOOK_SECRET env var
 *
 * The webhook is the ONLY way order.status changes from
 * 'awaiting_payment' to 'paid' to 'shipped' to 'released' etc.
 * Client never writes order status directly.
 */

import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type Stripe from 'stripe';
import { stripeClient } from '../shared/stripe';

const db = admin.firestore();


export const stripeWebhook = functions.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'] as string | undefined;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    res.status(400).send('Missing signature or webhook secret');
    return;
  }

  let event: Stripe.Event;
  try {
    // Stripe needs the raw body for signature verification
    event = stripeClient().webhooks.constructEvent(
      (req as any).rawBody,
      sig,
      webhookSecret,
    );
  } catch (err) {
    console.error('[stripeWebhook] signature verification failed:', err);
    res.status(400).send('Invalid signature');
    return;
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const orderId = pi.metadata.orderId;
        if (!orderId) {
          console.warn('[stripeWebhook] no orderId in metadata');
          break;
        }
        // Update order to 'paid' (funds now in escrow on platform)
        await db.doc(`orders/${orderId}`).update({
          status: 'paid',
          paidAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        // Update buyer's wallet pendingEscrow
        const buyerId = pi.metadata.buyerId;
        if (buyerId) {
          await db.doc(`users/${buyerId}/wallet/main`).set({
            pendingEscrow: FieldValue.increment(pi.amount / 100),
          }, { merge: true });
        }
        console.log(`[stripeWebhook] order ${orderId} paid`);
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const orderId = pi.metadata.orderId;
        if (orderId) {
          await db.doc(`orders/${orderId}`).update({
            status: 'payment_failed',
            failureReason: pi.last_payment_error?.message ?? 'unknown',
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        break;
      }
      case 'transfer.created': {
        // Funds released from platform to seller's Connect account
        const transfer = event.data.object as Stripe.Transfer;
        // Optional: log this for audit
        console.log(`[stripeWebhook] transfer ${transfer.id} created: ${transfer.amount}`);
        break;
      }
      case 'charge.refunded': {
        // Refund processed — flip order to 'refunded' and adjust wallets
        const charge = event.data.object as Stripe.Charge;
        const piId = charge.payment_intent as string;
        if (piId) {
          // Look up order by paymentIntentId
          const ordersSnap = await db.collection('orders')
            .where('paymentIntentId', '==', piId).limit(1).get();
          if (!ordersSnap.empty) {
            const orderDoc = ordersSnap.docs[0];
            const orderData = orderDoc.data();
            await orderDoc.ref.update({
              status: 'refunded',
              refundedAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
            // Restore buyer's wallet pendingEscrow
            if (orderData.buyerId) {
              await db.doc(`users/${orderData.buyerId}/wallet/main`).set({
                pendingEscrow: FieldValue.increment(-(charge.amount / 100)),
              }, { merge: true });
            }
          }
        }
        break;
      }
      default:
        console.log(`[stripeWebhook] unhandled event type: ${event.type}`);
    }
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[stripeWebhook] handler error:', err);
    res.status(500).send('Handler error');
  }
});
