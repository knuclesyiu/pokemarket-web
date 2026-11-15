/**
 * WithdrawScreen — move a seller's balance out to their bank.
 *
 * The money never sits with PokeMarket: the balance in the app is
 * what Stripe already owes the seller's connected account, and this
 * screen asks Stripe to pay it out. The server checks the amount
 * against the balance it recorded and takes the money out in the same
 * write that records the payout, so a retry cannot pay twice.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useAuth } from '../contexts/AuthContext';
import { subscribeWallet, WalletState } from '../services/walletService';
import {
  checkSellerOnboarding,
  createWithdrawal,
} from '../services/stripeService';
import { confirmAction, notify } from '../components/Feedback';
import { C } from '../theme';

type NavProp = NativeStackNavigationProp<any>;

const MIN_WITHDRAWAL_HKD = 50;

const WithdrawScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const { currentUser } = useAuth();

  const [wallet, setWallet] = useState<WalletState>({
    balance: 0,
    pendingEscrow: 0,
    onboardingComplete: false,
  });
  const [accountId, setAccountId] = useState<string | null>(null);
  const [onboarded, setOnboarded] = useState(false);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const available = useMemo(
    () => Math.max(0, wallet.balance - wallet.pendingEscrow),
    [wallet.balance, wallet.pendingEscrow],
  );

  useEffect(() => {
    const uid = currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }
    const unsub = subscribeWallet(uid, setWallet);
    return unsub;
  }, [currentUser?.uid]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await checkSellerOnboarding();
        if (cancelled) return;
        setAccountId(data.accountId);
        setOnboarded(data.onboarded);
      } catch (e) {
        console.warn('[Withdraw] onboarding status failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const parsed = Number(amount.replace(/[^0-9.]/g, ''));
  const valid =
    Number.isFinite(parsed) &&
    parsed >= MIN_WITHDRAWAL_HKD &&
    parsed <= available;

  const reason = useMemo(() => {
    if (!amount) return null;
    if (!Number.isFinite(parsed)) return '請輸入有效金額';
    if (parsed < MIN_WITHDRAWAL_HKD)
      return `最少提現 HK$ ${MIN_WITHDRAWAL_HKD}`;
    if (parsed > available)
      return `超過可提現餘額 HK$ ${available.toFixed(2)}`;
    return null;
  }, [amount, parsed, available]);

  const submit = useCallback(async () => {
    if (!valid || !accountId) return;
    setBusy(true);
    try {
      const res = await createWithdrawal(parsed, accountId);
      confirmAction(
        '提現已提交',
        `HK$ ${parsed.toFixed(2)} 已經交俾 Stripe 處理。\n` +
          `一般 1–3 個工作日到账。\n\n提現編號：${res.payoutId}`,
        [{ text: '好', onPress: () => navigation.goBack() }],
      );
    } catch (e: any) {
      console.warn('[Withdraw] failed', e);
      notify('提現失敗', String(e?.message ?? '請稍後再試'));
    } finally {
      setBusy(false);
    }
  }, [valid, accountId, parsed, navigation]);

  if (!onboarded && !loading) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
          >
            <Text style={styles.backText}>← 返回</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>提現</Text>
        </View>

        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>未設定收款帳戶</Text>
          <Text style={styles.noticeBody}>
            提現需要一個 Stripe 收款帳戶。設定好之後，賣卡收到嘅錢就可以直接轉去你嘅銀行戶口。
          </Text>
        </View>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => navigation.navigate('SellerOnboarding')}
        >
          <Text style={styles.primaryBtnText}>去設定收款帳戶 →</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
          >
            <Text style={styles.backText}>← 返回</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>提現</Text>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>可提現餘額</Text>
          <Text style={styles.balanceValue}>
            {loading ? '—' : `HK$ ${available.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`}
          </Text>
          <Text style={styles.balanceHint}>
            提現最低 HK$ {MIN_WITHDRAWAL_HKD}
          </Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.inputLabel}>提現金額 (HK$)</Text>
          <View style={styles.inputRow}>
            <Text style={styles.currency}>HK$</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={C.textDisabled}
            />
            <TouchableOpacity
              style={styles.maxBtn}
              onPress={() => setAmount(available.toFixed(2))}
            >
              <Text style={styles.maxBtnText}>全部</Text>
            </TouchableOpacity>
          </View>
          {reason ? <Text style={styles.errorText}>{reason}</Text> : null}
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, (!valid || busy) && styles.primaryBtnDisabled]}
          onPress={submit}
          disabled={!valid || busy}
        >
          {busy ? (
            <ActivityIndicator color={C.void} />
          ) : (
            <Text style={styles.primaryBtnText}>
              確認提現{parsed > 0 ? ` HK$ ${parsed.toFixed(2)}` : ''}
            </Text>
          )}
        </TouchableOpacity>

        <Text style={styles.footnote}>
          提現由 Stripe 處理，款項直接轉入你登記嘅銀行戶口（一般 1–3 個工作日）。
          PokeMarket 唔會代收代付，平台只收固定服務費。
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
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
  headerTitle: { color: C.text, fontSize: 22, fontWeight: '700' },
  noticeCard: {
    margin: 20,
    padding: 20,
    borderRadius: 16,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.warn,
  },
  noticeTitle: { color: C.warn, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  noticeBody: { color: C.text, fontSize: 14, lineHeight: 21 },
  balanceCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 20,
    borderRadius: 16,
    backgroundColor: C.card,
  },
  balanceLabel: { color: C.textSecondary, fontSize: 13 },
  balanceValue: {
    color: C.gold,
    fontSize: 32,
    fontWeight: '800',
    marginTop: 4,
  },
  balanceHint: { color: C.textDisabled, fontSize: 12, marginTop: 6 },
  formCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 18,
    borderRadius: 16,
    backgroundColor: C.card,
  },
  inputLabel: { color: C.textSecondary, fontSize: 13, marginBottom: 10 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  currency: { color: C.textSecondary, fontSize: 18, marginRight: 8 },
  input: {
    flex: 1,
    color: C.text,
    fontSize: 24,
    fontWeight: '700',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  maxBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(212,175,55,0.15)',
  },
  maxBtnText: { color: C.gold, fontSize: 13, fontWeight: '700' },
  errorText: { color: C.warn, fontSize: 12, marginTop: 8 },
  primaryBtn: {
    marginHorizontal: 20,
    backgroundColor: C.gold,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { color: C.void, fontSize: 16, fontWeight: '700' },
  footnote: {
    color: C.textDisabled,
    fontSize: 11,
    lineHeight: 17,
    marginHorizontal: 20,
    marginTop: 14,
    marginBottom: 40,
  },
});

export default WithdrawScreen;
