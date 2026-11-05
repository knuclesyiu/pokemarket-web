/**
 * Card input — WEB implementation.
 *
 * Metro picks this file for web and `CardPaymentForm.tsx` for
 * iOS/Android (platform-specific extension resolution).
 *
 * Uses Stripe's own `<CardElement />` inside an `<Elements>` provider.
 * This is the only way modern Stripe SDKs accept card details: the raw
 * number must never be read by our code — Stripe collects it inside its
 * own iframe so it never touches our server.
 *
 * The component reports a `getPaymentMethodId()` factory to the parent
 * via `onPaymentMethodReady`, so the parent can turn the entered card
 * into a PaymentMethod at the moment of payment.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import type { CardDetails } from '../types/stripe';

const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

export type GetPaymentMethodId = () => Promise<string | null>;

interface Props {
  /**
   * Receives the factory that turns the entered card into a
   * PaymentMethod. The parent stores it and calls it when the buyer
   * confirms the order.
   */
  onPaymentMethodReady?: (getPaymentMethodId: GetPaymentMethodId) => void;
  submitting?: boolean;
}

/** Inner form — needs the Elements context. */
const CardFields: React.FC<{
  submitting?: boolean;
  onPaymentMethodReady?: (getPaymentMethodId: GetPaymentMethodId) => void;
}> = ({ submitting, onPaymentMethodReady }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);

  const getPaymentMethodId = useCallback(async () => {
    if (!stripe || !elements) {
      throw new Error('Stripe 未準備好，請稍後再試');
    }
    const card = elements.getElement(CardElement);
    if (!card) {
      throw new Error('請先填寫信用卡資料');
    }
    const { error: createError, paymentMethod } = await stripe.createPaymentMethod({
      type: 'card',
      card,
    });
    if (createError) {
      throw new Error(createError.message ?? '信用卡資料有問題');
    }
    return paymentMethod?.id ?? null;
  }, [stripe, elements]);

  React.useEffect(() => {
    onPaymentMethodReady?.(getPaymentMethodId);
  }, [onPaymentMethodReady, getPaymentMethodId]);

  return (
    <View>
      <View style={styles.cardElementWrap}>
        <CardElement
          options={{
            style: {
              base: {
                color: '#F0F0FF',
                fontFamily: 'System',
                fontSize: '16px',
                '::placeholder': { color: '#4A4A70' },
              },
              invalid: { color: '#FF3C3C' },
            },
          }}
          onChange={(e) => setError(e.error?.message ?? null)}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
};

const CardPaymentForm: React.FC<Props> = ({ onPaymentMethodReady, submitting }) => {
  const stripePromise = useMemo(
    () => (PUBLISHABLE_KEY ? loadStripe(PUBLISHABLE_KEY) : null),
    [],
  );

  if (!PUBLISHABLE_KEY) {
    return (
      <View style={styles.missingKey}>
        <Text style={styles.missingKeyText}>
          未設定 Stripe publishable key，暫時無法用信用卡付款。請改用 FPS 轉數快。
        </Text>
      </View>
    );
  }

  return (
    <Elements stripe={stripePromise as any}>
      <CardFields
        submitting={submitting}
        onPaymentMethodReady={onPaymentMethodReady}
      />
    </Elements>
  );
};

const styles = StyleSheet.create({
  cardElementWrap: {
    backgroundColor: '#14142A',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#2A2A50',
  },
  error: { color: '#FF3C3C', fontSize: 12, marginTop: 8 },
  missingKey: {
    backgroundColor: 'rgba(255,107,53,0.08)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.3)',
  },
  missingKeyText: { color: '#FF6B35', fontSize: 13, lineHeight: 20 },
});

export default CardPaymentForm;
export type { CardDetails };
