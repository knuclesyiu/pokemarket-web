/**
 * The seller's payout details.
 *
 * Four fields, and that is deliberately all: the seller is not made to
 * complete a KYC form to be paid for a card. The rail they are paid
 * through does the verification itself.
 *
 * The name has to be the name on the bank account — the payout rail
 * only releases money to a beneficiary whose name matches the
 * recipient account's — so that field is spelled out rather than
 * pre-filled from the profile, where it might be a nickname.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { t } from '../i18n';
import { useAppearance } from '../contexts/AppearanceContext';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { notify } from '../components/Feedback';
import { C, themed } from '../theme';
import { SP } from '../theme';

type RoutingType =
  | 'phone_number'
  | 'email_address'
  | 'fps_identifier'
  | 'personal_id_number'
  | 'bank_code';

const ROUTING_OPTIONS: Array<{ value: RoutingType; label: string; hint: string }> = [
  { value: 'fps_identifier', label: 'FPS ID', hint: t('7-9 位數字') },
  { value: 'phone_number', label: t('手機號碼'), hint: t('已登記喺銀行戶口嘅號碼') },
  { value: 'email_address', label: t('電郵地址'), hint: t('已登記喺銀行戶口嘅電郵') },
  { value: 'personal_id_number', label: t('香港身份證號碼'), hint: 'X123456(A)' },
  { value: 'bank_code', label: t('銀行帳號 + 行號'), hint: t('行號 3 位數 + 帳號') },
];

export default function SellerPayoutDetailsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { language } = useAppearance();

  const [accountName, setAccountName] = useState('');
  const [routingType, setRoutingType] = useState<RoutingType>('fps_identifier');
  const [routingValue, setRoutingValue] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<any>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  const styles = useMemoStyles();

  const load = useCallback(async () => {
    try {
      const fn = getFunctions();
      const status = httpsCallable(fn, 'getSellerPayoutStatus');
      const res = await status({});
      const d = res.data as any;
      setNotConfigured(d.configured === false);
      setExisting(d.details ?? null);
      if (d.details?.accountName) setAccountName(d.details.accountName);
      if (d.details?.routingType) setRoutingType(d.details.routingType);
    } catch (e: any) {
      notify(t('操作失敗'), e?.message ?? t('請稍後再試'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!accountName.trim()) {
      notify(t('請填寫銀行戶口持有人姓名'), t('呢個名要同銀行戶口名一樣'));
      return;
    }
    if (!routingValue.trim()) {
      notify(t('請填寫收款識別碼'), t('揀返上面嘅收款方式'));
      return;
    }
    if (routingType === 'bank_code' && !accountNumber.trim()) {
      notify(t('請填寫銀行帳號'), t('行號唔可以代替帳號'));
      return;
    }
    setSaving(true);
    try {
      const fn = getFunctions();
      const setDetails = httpsCallable(fn, 'setSellerPayoutDetails');
      await setDetails({
        accountName: accountName.trim(),
        routingType,
        routingValue: routingValue.trim(),
        accountNumber: routingType === 'bank_code' ? accountNumber.trim() : '',
      });
      notify(t('已儲存'), t('收款資料已設定，賣家可以提現。'));
      navigation.goBack();
    } catch (e: any) {
      notify(t('設定失敗'), e?.message ?? t('請稍後再試'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ActivityIndicator color={C.gold} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color={C.text} />
            </TouchableOpacity>
            <Text style={styles.title}>{t('收款設定')}</Text>
          </View>

          {notConfigured && (
            <View style={styles.warnBox}>
              <Ionicons name="alert-circle-outline" size={16} color={C.warn} />
              <Text style={styles.warnText}>
                {t('出款服務未設定，暫時未能提交收款資料。')}
              </Text>
            </View>
          )}

          {existing && (
            <View style={styles.okBox}>
              <Ionicons name="checkmark-circle" size={16} color={C.up} />
              <Text style={styles.okText}>
                {t('已設定收款資料')} · {existing.maskedValue}
              </Text>
            </View>
          )}

          <Text style={styles.label}>{t('銀行戶口持有人姓名')}</Text>
          <TextInput
            style={styles.input}
            value={accountName}
            onChangeText={setAccountName}
            placeholder={t('同銀行戶口一樣嘅名')}
            placeholderTextColor={C.textTertiary}
            autoCapitalize="words"
          />
          <Text style={styles.hint}>
            {t('出款只會畀同名嘅收款人，所以呢個名一定要啱。')}
          </Text>

          <Text style={styles.label}>{t('收款方式')}</Text>
          {ROUTING_OPTIONS.map((opt) => {
            const active = routingType === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.option, active && styles.optionActive]}
                onPress={() => setRoutingType(opt.value)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>
                    {opt.label}
                  </Text>
                  <Text style={styles.optionHint}>{opt.hint}</Text>
                </View>
                <Ionicons
                  name={active ? 'radio-button-on' : 'radio-button-off'}
                  size={18}
                  color={active ? C.gold : C.textTertiary}
                />
              </TouchableOpacity>
            );
          })}

          <Text style={styles.label}>{t('收款識別碼')}</Text>
          <TextInput
            style={styles.input}
            value={routingValue}
            onChangeText={setRoutingValue}
            placeholder={
              routingType === 'phone_number'
                ? '+852-12345678'
                : routingType === 'email_address'
                  ? 'name@example.com'
                  : routingType === 'personal_id_number'
                    ? 'X123456(A)'
                    : routingType === 'bank_code'
                      ? '012'
                      : '123456789'
            }
            placeholderTextColor={C.textTertiary}
            autoCapitalize="none"
            keyboardType={
              routingType === 'phone_number' || routingType === 'fps_identifier'
                ? 'number-pad'
                : 'default'
            }
          />

          {routingType === 'bank_code' && (
            <>
              <Text style={styles.label}>{t('銀行帳號')}</Text>
              <TextInput
                style={styles.input}
                value={accountNumber}
                onChangeText={setAccountNumber}
                placeholder={t('銀行帳號')}
                placeholderTextColor={C.textTertiary}
                keyboardType="number-pad"
              />
            </>
          )}

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={save}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={C.void} />
            ) : (
              <Text style={styles.saveBtnText}>{t('儲存收款資料')}</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.footnote}>
            {t('資料只會存喺伺服器，唔會俾第三方睇。轉數快出款一般 0-1 個工作天到帳。')}
          </Text>
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** The stylesheet follows the active palette. */
function useMemoStyles() {
  return themed((C) =>
    StyleSheet.create({
      container: { flex: 1, backgroundColor: C.void },
      scroll: { padding: SP.lg, paddingBottom: SP.xl },
      header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: SP.lg,
      },
      backBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: C.surface,
        alignItems: 'center',
        justifyContent: 'center',
      },
      title: { fontSize: 20, fontWeight: '700', color: C.text },
      warnBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: C.card,
        borderRadius: 12,
        padding: 12,
        marginBottom: SP.md,
      },
      warnText: { flex: 1, fontSize: 13, color: C.warn, lineHeight: 18 },
      okBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: C.card,
        borderRadius: 12,
        padding: 12,
        marginBottom: SP.md,
      },
      okText: { flex: 1, fontSize: 13, color: C.up },
      label: {
        fontSize: 13,
        fontWeight: '600',
        color: C.textSecondary,
        marginBottom: 6,
        marginTop: SP.md,
      },
      input: {
        backgroundColor: C.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: C.border,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        color: C.text,
      },
      hint: { fontSize: 12, color: C.textTertiary, marginTop: 6, lineHeight: 17 },
      option: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: C.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: C.border,
        padding: 14,
        marginBottom: 8,
      },
      optionActive: { borderColor: C.gold, backgroundColor: C.goldDim },
      optionLabel: { fontSize: 15, fontWeight: '600', color: C.text },
      optionLabelActive: { color: C.gold },
      optionHint: { fontSize: 12, color: C.textTertiary, marginTop: 2 },
      saveBtn: {
        marginTop: SP.xl,
        backgroundColor: C.gold,
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: 'center',
      },
      saveBtnText: { fontSize: 16, fontWeight: '700', color: C.void },
      footnote: {
        marginTop: SP.md,
        fontSize: 12,
        color: C.textTertiary,
        lineHeight: 18,
        textAlign: 'center',
      },
    }),
  );
}
