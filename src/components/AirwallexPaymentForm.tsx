/**
 * The native build has no Airwallex element yet.
 *
 * The card payment on native was never finished either — it is a stub
 * that says so — so this is not a regression. It says what is missing
 * instead of failing silently.
 */
import { t } from '../i18n';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { C, themed } from '../theme';

export interface AirwallexPaymentFormProps {
  clientSecret: string;
  paymentIntentId: string;
  merchantOrderId: string;
  amountHkd: number;
  clientId: string;
  environment: 'sandbox' | 'production';
  onSuccess: () => void;
  onError: (message: string) => void;
}

export default function AirwallexPaymentForm(props: AirwallexPaymentFormProps) {
  const styles = themed((C) => StyleSheet.create({
    box: {
      backgroundColor: C.card,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: C.border,
    },
    text: { fontSize: 13, color: C.textSecondary, lineHeight: 20 },
  }));

  return (
    <View style={styles.box}>
      <Text style={styles.text}>
        {t('轉數快同信用卡收款暫時只支援網頁版，請用網頁落單。手機版會盡快接上。')}
      </Text>
    </View>
  );
}
