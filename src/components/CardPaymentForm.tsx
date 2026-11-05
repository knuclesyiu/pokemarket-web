/**
 * Card input — NATIVE implementation.
 *
 * Metro picks this file for iOS/Android and `CardPaymentForm.web.tsx`
 * for web (platform-specific extension resolution).
 *
 * The app has no native Stripe card input yet. Modern Stripe SDKs only
 * accept card details that were collected by Stripe's own secure input
 * component — on native that is `<CardForm />` from
 * `@stripe/stripe-react-native`, which must be wrapped in a
 * `<StripeProvider publishableKey={...}>`.
 *
 * Rather than collect raw card numbers into plain TextInputs (which is
 * exactly what the old, broken code did — and which no current Stripe
 * SDK will accept anyway), the native form tells the buyer that card
 * payment is web-only and points them at FPS (轉數快), the primary HK
 * payment method in the app.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export type GetPaymentMethodId = () => Promise<string | null>;

interface Props {
  /**
   * Receives the factory that turns the entered card into a
   * PaymentMethod. Native has no card input, so the factory always
   * rejects with an explanatory error.
   */
  onPaymentMethodReady?: (getPaymentMethodId: GetPaymentMethodId) => void;
  submitting?: boolean;
}

const CardPaymentForm: React.FC<Props> = ({ onPaymentMethodReady }) => {
  React.useEffect(() => {
    onPaymentMethodReady?.(() =>
      Promise.reject(
        new Error(
          '手機版暫時未支援信用卡付款。請改用「FPS 轉數快」付款，' +
            '或者用網頁版完成呢筆交易。',
        ),
      ),
    );
  }, [onPaymentMethodReady]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.icon}>💳</Text>
      <Text style={styles.title}>信用卡付款暫時只支援網頁版</Text>
      <Text style={styles.body}>
        手機版請改用「FPS 轉數快」付款，即時轉帳一樣方便。
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: '#14142A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A50',
  },
  icon: { fontSize: 32, marginBottom: 12 },
  title: { color: '#F0F0FF', fontSize: 15, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  body: { color: '#8888CC', fontSize: 13, lineHeight: 20, textAlign: 'center' },
});

export default CardPaymentForm;
