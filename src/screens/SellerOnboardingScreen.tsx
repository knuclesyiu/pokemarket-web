/**
 * SellerOnboardingScreen — set up a Stripe Connect account so the
 * user can receive money.
 *
 * The seller has to give Stripe their details once. Stripe hosts that
 * page; this screen only opens it and then asks the server whether
 * it was finished. The server is the only thing that decides
 * whether a seller is onboarded, because the client cannot be
 * trusted to report its own account as ready.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { t } from '../i18n';
import { useAppearance } from '../contexts/AppearanceContext';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Platform, Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as WebBrowser from 'expo-web-browser';

import {
  startSellerOnboarding,
  checkSellerOnboarding,
} from '../services/stripeService';
import { notify } from '../components/Feedback';
import { C, themed } from '../theme';

type NavProp = NativeStackNavigationProp<any>;

type Status = 'unknown' | 'not-started' | 'pending' | 'onboarded';

const STATUS_TEXT: Record<Status, { title: string; body: string; tone: string }> = {
  unknown: {
    title: 'Checking…',
    body: '睇下你嘅收款帳戶設定咗未。',
    tone: C.textSecondary,
  },
  'not-started': {
    title: '未設定收款帳戶',
    body: '設定咗之後你賣卡收到嘅錢先會入到你嘅戶口。Stripe 會帶你去一個官方頁面填資料，大約 3 分鐘。',
    tone: C.warn,
  },
  pending: {
    title: '仲未完成設定',
    body: 'Stripe 仲有嘢要你填。撳下面繼續，或者檢查返啱啱做咗乜。',
    tone: C.gold,
  },
  onboarded: {
    title: '收款帳戶已設定 ✓',
    body: '你可以喺錢包提現。有新卡賣出同放款之後，餘額會喺呢度出現。',
    tone: C.up,
  },
};

const SellerOnboardingScreen: React.FC = () => {
  const { t } = useAppearance();

  const navigation = useNavigation<NavProp>();
  const [status, setStatus] = useState<Status>('unknown');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await checkSellerOnboarding();
      setAccountId(data.accountId);
      setStatus(data.onboarded ? 'onboarded' : data.accountId ? 'pending' : 'not-started');
    } catch (e: any) {
      console.warn('[SellerOnboarding] status failed', e);
      setStatus('not-started');
      notify(
        '查唔到狀態',
        String(e?.message ?? '請稍後再試'),
      );
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openOnboarding = useCallback(async () => {
    setBusy(true);
    try {
      const data = await startSellerOnboarding({});
      setAccountId(data.accountId);
      setStatus('pending');

      if (Platform.OS === 'web') {
        const w = globalThis as any;
        if (w?.open) {
          w.open(data.onboardingUrl, '_blank', 'noopener,noreferrer');
        } else {
          await Linking.openURL(data.onboardingUrl);
        }
      } else {
        await WebBrowser.openBrowserAsync(data.onboardingUrl);
      }

      // Give the browser a moment, then ask the server whether the
      // seller finished. Stripe redirects back to the app URL, which
      // the server knows about.
      setTimeout(refresh, 1500);
    } catch (e: any) {
      console.warn('[SellerOnboarding] start failed', e);
      notify(
        '開唔到 Stripe 設定頁',
        String(e?.message ?? '請稍後再試'),
      );
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const info = STATUS_TEXT[status];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>{t('← 返回')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('收款帳戶')}</Text>
      </View>

      <View style={[styles.statusCard, { borderColor: info.tone }]}>
        <Text style={[styles.statusTitle, { color: info.tone }]}>{t(info.title)}</Text>
        <Text style={styles.statusBody}>{info.body}</Text>

        {accountId ? (
          <Text style={styles.accountId}>帳戶：{accountId}</Text>
        ) : null}
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>{t('你需要準備')}</Text>
        {[
          '香港身份證（用於 KYC）',
          '本人名下的銀行戶口',
          '手機（接收驗證短訊）',
        ].map((line) => (
          <View key={line} style={styles.infoRow}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.infoLine}>{line}</Text>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        {status === 'onboarded' ? (
          <TouchableOpacity
            style={[styles.primaryBtn, styles.secondaryBtn]}
            onPress={() => navigation.navigate('WalletTab')}
          >
            <Text style={styles.secondaryBtnText}>{t('去錢包提現')}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={openOnboarding}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={C.void} />
            ) : (
              <Text style={styles.primaryBtnText}>
                {status === 'pending' ? '繼續設定 →' : '開始設定收款帳戶 →'}
              </Text>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.secondaryBtn} onPress={refresh} disabled={busy}>
          <Text style={styles.secondaryBtnText}>{t('檢查狀態')}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.footnote}>
        Stripe 係獨立嘅支付服務商，佢哋會按自己嘅政策審核你嘅資料。PokeMarket
        唔會存你嘅銀行資料，亦唔會代你收款 —— 款項由 Stripe 直接轉入你嘅戶口。
      </Text>
    </ScrollView>
  );
};

const styles = themed((C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.void },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 12,
  },
  backBtn: { paddingVertical: 6, paddingRight: 12 },
  backText: { color: C.textSecondary, fontSize: 16 },
  headerTitle: {
    color: C.text,
    fontSize: 22,
    fontWeight: '700',
    flex: 1,
  },
  statusCard: {
    margin: 20,
    marginBottom: 12,
    padding: 20,
    borderRadius: 16,
    backgroundColor: C.card,
    borderWidth: 1,
  },
  statusTitle: { fontSize: 19, fontWeight: '700', marginBottom: 8 },
  statusBody: { color: C.text, fontSize: 14, lineHeight: 21 },
  accountId: {
    color: C.textSecondary,
    fontSize: 11,
    marginTop: 12,
    fontFamily: 'monospace',
  },
  infoCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 18,
    borderRadius: 16,
    backgroundColor: C.card,
  },
  infoTitle: {
    color: C.gold,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
  },
  infoRow: { flexDirection: 'row', marginBottom: 6 },
  bullet: { color: C.gold, marginRight: 8, fontSize: 14 },
  infoLine: { color: C.text, fontSize: 14, flex: 1 },
  actions: { marginHorizontal: 20, marginTop: 6 },
  primaryBtn: {
    backgroundColor: C.gold,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryBtnText: { color: C.void, fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    backgroundColor: 'transparent',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 10,
  },
  secondaryBtnText: { color: C.textSecondary, fontSize: 15, fontWeight: '600' },
  footnote: {
    color: C.textDisabled,
    fontSize: 11,
    lineHeight: 17,
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 40,
  },
}))

export default SellerOnboardingScreen;
