/**
 * Taking the buyer's money through Airwallex.
 *
 * Airwallex's drop-in element shows every payment method the account
 * has enabled — card, FPS, the wallets — in one place, so there is no
 * separate "FPS" button to build and no card fields of our own to get
 * wrong. The element holds the card details; our code never sees them.
 *
 * The element confirms the payment itself. That is the difference from
 * the Stripe form: there, our code hands a payment method to the SDK;
 * here, the buyer confirms inside Airwallex's own UI and we are told
 * afterwards.
 */
import { t } from '../i18n';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

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
  const [loading, setLoading] = useState(true);
  const [hint, setHint] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    (async () => {
      try {
        // Loaded on demand: the SDK is only needed on the Airwallex
        // rail, and it is not small.
        const sdk: any = await import('@airwallex/components-sdk');

        await sdk.init({
          env: props.environment,
          client_id: props.clientId,
          currency: 'HKD',
          locale: 'zh-HK',
        });

        const element = await sdk.createElement('dropIn', {
          mode: 'payment',
          currency: 'HKD',
          countryCode: 'HK',
          amount: Math.round(props.amountHkd * 100),
          merchantOrderId: props.merchantOrderId,
          clientSecret: props.clientSecret,
          layout: 'tab',
          elements: {
            paymentMethod: {
              title: t('付款方式'),
              // The buyer picks FPS here if the account has it enabled.
              alignment: 'left',
            },
          },
        });

        if (!mounted.current) return;

        element.mount('#airwallex-container');

        element.on('onConfirm', async () => {
          try {
            const result = await element.confirm({});
            const status = String(result?.status ?? '');
            if (!mounted.current) return;
            if (status === 'SUCCEEDED' || status === 'success') {
              props.onSuccess();
            } else if (status === 'CANCELLED') {
              setHint(t('已取消付款'));
            } else {
              // 'inProgress' means the payment is with the processor:
              // the webhook will say so, and the order screen polls.
              props.onSuccess();
            }
          } catch (err: any) {
            if (!mounted.current) return;
            props.onError(String(err?.message ?? t('付款失敗')));
          }
        });

        setLoading(false);
      } catch (err: any) {
        if (!mounted.current) return;
        setLoading(false);
        props.onError(
          t('載入付款方式失敗：{p0}', { p0: String(err?.message ?? err).slice(0, 160) }),
        );
      }
    })();

    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const styles = themed((C) => StyleSheet.create({
    wrapper: { minHeight: 320, paddingBottom: 8 },
    loading: { paddingVertical: 40, alignItems: 'center' as const },
    hint: {
      marginTop: 12,
      fontSize: 13,
      color: C.textTertiary,
      textAlign: 'center' as const,
    },
  }));

  return (
    <View style={styles.wrapper}>
      {/* The Airwallex element mounts itself here. */}
      <View id="airwallex-container" />
      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator color={C.gold} />
        </View>
      )}
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}
