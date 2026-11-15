/**
 * WalletScreen — Real Firestore-backed wallet + transaction history.
 *
 * v2 changes:
 *   - Removed hard-coded mock balance (12430 / 4200) — now reads
 *     users/{uid}/wallet/main via subscribeWallet()
 *   - Removed empty MOCK_TRANSACTIONS — now subscribes to
 *     users/{uid}/transactions via subscribeTransactions()
 *   - Top-up / Withdraw buttons now show a "coming soon" toast
 *     rather than doing nothing silently
 *   - Re-subscribes when user changes
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import {
  subscribeWallet, subscribeTransactions,
  WalletState, WalletTransaction, WalletTxState,
} from '../services/walletService';
import { notify } from '../components/Feedback';
import { C } from '../theme';
import Ionicons from '@expo/vector-icons/Ionicons';

type NavProp = NativeStackNavigationProp<any>;

type EscrowState = 'pending' | 'in_escrow' | 'released';

interface EscrowTransaction extends WalletTransaction {}

const STATE_LABELS: Record<EscrowState, { zh: string; color: string; bg: string }> = {
  pending:   { zh: '待確認',  color: C.gold, bg: 'rgba(212,175,55,0.15)' },
  in_escrow: { zh: '託付中',  color: C.warn, bg: 'rgba(255,107,53,0.15)' },
  released:  { zh: '已完成',  color: C.up, bg: 'rgba(0,200,150,0.15)' },
};

const WalletScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<EscrowState | 'all'>('all');
  const [walletData, setWalletData] = useState<WalletState>({
    balance: 0,
    pendingEscrow: 0,
    onboardingComplete: false,
  });
  const [transactions, setTransactions] = useState<EscrowTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Subscribe to wallet + transactions. Re-runs when the user changes.
  useEffect(() => {
    const uid = currentUser?.uid;
    if (!uid) {
      setWalletData({ balance: 0, pendingEscrow: 0, onboardingComplete: false });
      setTransactions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubWallet = subscribeWallet(uid, w => setWalletData(w));
    const unsubTx = subscribeTransactions(uid, txs => {
      setTransactions(txs);
      setLoading(false);
    });
    return () => {
      unsubWallet();
      unsubTx();
    };
  }, [currentUser?.uid]);

  const balance = walletData.balance;
  const inEscrow = walletData.pendingEscrow;
  const available = balance - inEscrow;

  // Map WalletTxState → EscrowState for display
  const toEscrowState = (s: WalletTxState): EscrowState => {
    if (s === 'pending') return 'pending';
    if (s === 'released') return 'released';
    return 'in_escrow'; // in_escrow / disputed / refunded all show as "in escrow"
  };

  const filtered = activeTab === 'all'
    ? transactions
    : transactions.filter(t => toEscrowState(t.state) === activeTab);

  const tabs: { key: EscrowState | 'all'; label: string; count: number }[] = [
    { key: 'all',       label: '全部',   count: transactions.length },
    { key: 'pending',   label: '待確認', count: transactions.filter(t => toEscrowState(t.state) === 'pending').length },
    { key: 'in_escrow', label: '託付中', count: transactions.filter(t => toEscrowState(t.state) === 'in_escrow').length },
    { key: 'released',  label: '已完成', count: transactions.filter(t => toEscrowState(t.state) === 'released').length },
  ];

  const handleTopUp = () => {
    notify(
      '充值功能即將推出',
      '我們正在整合 Stripe 信用卡及 FPS 充值管道。\n請期待下次更新，或聯絡客服協助。',
    );
  };

  const handleWithdraw = () => {
    if (available <= 0) {
      notify(
        '暫時無法提現',
        '可用餘額為 HK$ 0。完成交易後賣出嘅卡入咗帳戶，就可以提現。',
      );
      return;
    }
    // The withdrawal screen checks the seller's Stripe account and
    // sends the payout request; the server is what decides whether
    // the money can move.
    navigation.navigate('Withdraw');
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>我的錢包</Text>
        <TouchableOpacity style={styles.settingsBtn}>
          <Ionicons name="settings-outline" size={16} color={C.textTertiary} />
        </TouchableOpacity>
      </View>

      {/* Balance Card — premium bank app feel with gold CTA */}
      <View style={styles.balanceCard}>
        <View style={styles.balanceHeader}>
          <View>
            <Text style={styles.balanceLabel}>可提現餘額</Text>
            <Text style={styles.balanceValue}>
              {loading ? '—' : `HK$ ${available.toLocaleString()}`}
            </Text>
          </View>
          <View style={styles.balanceActions}>
            <TouchableOpacity style={styles.topupBtn} onPress={handleTopUp}>
              <Text style={styles.topupBtnText}>↑ 充值</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.withdrawBtn} onPress={handleWithdraw}>
              <Text style={styles.withdrawBtnText}>提現 →</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.balanceDivider} />
        <View style={styles.balanceSub}>
          <View style={styles.balanceSubItem}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="lock-closed-outline" size={13} color={C.textTertiary} /><Text style={styles.balanceSubLabel}>擔保中</Text></View>
            <Text style={styles.balanceSubValue}>
              {loading ? '—' : `HK$ ${inEscrow.toLocaleString()}`}
            </Text>
          </View>
          <View style={styles.balanceSubItem}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="wallet-outline" size={15} color={C.textTertiary} /><Text style={styles.balanceSubLabel}>總結餘</Text></View>
            <Text style={styles.balanceSubValue}>
              {loading ? '—' : `HK$ ${balance.toLocaleString()}`}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.fpsBadge}
          onPress={() => navigation.navigate('SellerOnboarding')}
        >
          <Text style={styles.fpsBadgeText}>
            {walletData.onboardingComplete
              ? '收款帳戶已設定 ✓ · 點擊查看'
              : '設定收款帳戶先可以提現 →'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Escrow explainer */}
      <View style={styles.escrowInfo}>
        <Text style={styles.escrowIcon}>🔐</Text>
        <View style={styles.escrowText}>
          <Text style={styles.escrowTitle}>資金由平台託付</Text>
          <Text style={styles.escrowDesc}>
            買家確認收卡後，款項先由平台持有，交易完成後才轉俾賣家，保障雙方
          </Text>
        </View>
      </View>

      {/* Escrow warning banner — show when any in-escrow tx auto-releases within 5 days */}
      {filtered.filter(t => t.state === 'in_escrow' && t.autoReleaseAt && t.autoReleaseAt - Date.now() < 5 * 24 * 60 * 60 * 1000).length > 0 && (
        <View style={styles.warningBanner}>
          <Ionicons name="warning-outline" size={16} color={C.textTertiary} />
          <View style={styles.warningText}>
            <Text style={styles.warningTitle}>款項即將自動釋放</Text>
            <Text style={styles.warningDesc}>
              以下款項將於 5 日內自動釋放給賣家，如未收到卡請立即聯絡
            </Text>
          </View>
        </View>
      )}

      {/* State tabs — gold active state */}
      <View style={styles.tabRow}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key ? styles.tabActive : null]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key ? styles.tabTextActive : null]}>
              {tab.label}
            </Text>
            {tab.count > 0 && (
              <View style={[styles.tabBadge, activeTab === tab.key ? styles.tabBadgeActive : null]}>
                <Text style={[styles.tabBadgeText, activeTab === tab.key ? styles.tabBadgeTextActive : null]}>
                  {tab.count}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Transaction list */}
      <View style={styles.txList}>
        {loading ? (
          <View style={{ alignItems: 'center', paddingVertical: 32 }}>
            <ActivityIndicator color={C.gold} />
            <Text style={{ color: C.textSecondary, fontSize: 12, marginTop: 8 }}>載入交易記錄…</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>暫時沒有記錄</Text>
            <Text style={styles.emptyHint}>
              買賣卡牌後，交易會顯示喺呢度
            </Text>
          </View>
        ) : (
          filtered.map(tx => {
            const state = STATE_LABELS[toEscrowState(tx.state)];
            return (
              <TouchableOpacity
                key={tx.id}
                style={styles.txCard}
                onPress={() => navigation.navigate('OrderStatus', { orderId: tx.id, txId: tx.id })}
                activeOpacity={0.7}
              >
                <View style={[styles.txIcon, tx.type === 'buy' ? styles.txBuyIcon : styles.txSellIcon]}>
                  <Text style={styles.txIconText}>{tx.type === 'buy' ? '↓' : '↑'}</Text>
                </View>
                <View style={styles.txInfo}>
                  <Text style={styles.txCardName}>{tx.cardName}</Text>
                  <Text style={styles.txCounterparty}>
                    {tx.type === 'sell' ? '賣俾 ' : '向 '}{tx.counterparty}
                  </Text>
                  <Text style={styles.txDate}>
                    {tx.createdAt
                      ? new Date(tx.createdAt).toLocaleDateString('zh-HK')
                      : ''}
                  </Text>
                </View>
                <View style={styles.txRight}>
                  <Text style={[styles.txAmount, tx.type === 'sell' ? styles.txAmountSell : styles.txAmountBuy]}>
                    {tx.type === 'sell' ? '+' : '-'}HK${tx.amount.toLocaleString()}
                  </Text>
                  <View style={[styles.stateBadge, { backgroundColor: state.bg }]}>
                    <Text style={[styles.stateBadgeText, { color: state.color }]}>
                      {state.zh}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        {/* Dispute banner */}
        <TouchableOpacity style={styles.disputeBanner}>
          <Ionicons name="shield-checkmark-outline" size={15} color={C.textTertiary} />
          <View style={styles.disputeText}>
            <Text style={styles.disputeTitle}>交易爭議？</Text>
            <Text style={styles.disputeDesc}>如遇問題，可提出爭議，平台將在 24 小時內審查</Text>
          </View>
          <Text style={styles.disputeArrow}>→</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.void },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
  },
  headerTitle: { color: C.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  settingsBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: C.card,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border,
  },
  settingsIcon: { fontSize: 18 },
  balanceCard: {
    backgroundColor: C.card, marginHorizontal: 16, borderRadius: 24,
    padding: 24, marginBottom: 12, borderWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35,
    shadowRadius: 20, elevation: 8,
  },
  balanceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  balanceLabel: { color: C.textSecondary, fontSize: 12 },
  balanceValue: { color: C.text, fontSize: 32, fontWeight: '800', marginTop: 4, letterSpacing: -1 },
  balanceActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  topupBtn: {
    backgroundColor: C.card, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: C.gold,
  },
  topupBtnText: { color: C.gold, fontSize: 12, fontWeight: '700' },
  withdrawBtn: { backgroundColor: C.gold, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  withdrawBtnText: { color: C.void, fontSize: 12, fontWeight: '700' },
  balanceDivider: { height: 1, backgroundColor: C.border, marginVertical: 14 },
  balanceSub: { flexDirection: 'row', gap: 24 },
  balanceSubItem: {},
  balanceSubLabel: { color: C.textSecondary, fontSize: 11 },
  balanceSubValue: { color: C.text, fontSize: 14, fontWeight: '700', marginTop: 2 },
  fpsBadge: {
    backgroundColor: 'rgba(0,150,255,0.12)', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start', marginTop: 12,
    borderWidth: 1, borderColor: 'rgba(0,150,255,0.2)',
  },
  fpsBadgeText: { color: '#0096FF', fontSize: 11, fontWeight: '600' },
  escrowInfo: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(212,175,55,0.08)',
    marginHorizontal: 16, borderRadius: 14, padding: 14, gap: 12, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(212,175,55,0.2)',
  },
  escrowIcon: { fontSize: 24 },
  escrowText: { flex: 1 },
  escrowTitle: { color: C.gold, fontSize: 13, fontWeight: '700', marginBottom: 4 },
  escrowDesc: { color: C.textSecondary, fontSize: 11, lineHeight: 16 },
  tabRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 6, marginBottom: 14 },
  tab: {
    flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: C.card,
    alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4,
  },
  tabActive: {
    backgroundColor: C.gold, shadowColor: C.gold, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 6, elevation: 4,
  },
  tabText: { color: C.textSecondary, fontSize: 11, fontWeight: '600' },
  tabTextActive: { color: C.void, fontWeight: '700' },
  tabBadge: { width: 16, height: 16, borderRadius: 8, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' },
  tabBadgeActive: { backgroundColor: 'rgba(0,0,0,0.2)' },
  tabBadgeText: { color: C.textSecondary, fontSize: 9, fontWeight: '700' },
  tabBadgeTextActive: { color: C.void },
  txList: { paddingHorizontal: 16, gap: 8, display: 'flex' },
  txCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.card,
    borderRadius: 14, padding: 14, gap: 12, borderWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25,
    shadowRadius: 10, elevation: 5,
  },
  txIcon: {
    width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  txBuyIcon: { backgroundColor: 'rgba(255,64,96,0.15)' },
  txSellIcon: { backgroundColor: 'rgba(0,200,150,0.15)' },
  txIconText: { fontSize: 18, fontWeight: '700' },
  txInfo: { flex: 1 },
  txCardName: { color: C.text, fontSize: 13, fontWeight: '700' },
  txCounterparty: { color: C.textSecondary, fontSize: 11, marginTop: 2 },
  txDate: { color: C.textDisabled, fontSize: 10, marginTop: 2 },
  txRight: { alignItems: 'flex-end', gap: 4 },
  txAmount: { fontSize: 15, fontWeight: '700' },
  txAmountSell: { color: C.up },
  txAmountBuy: { color: C.ruby },
  stateBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  stateBadgeText: { fontSize: 10, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 40, marginBottom: 8 },
  emptyText: { color: C.textSecondary, fontSize: 14, marginBottom: 4 },
  emptyHint: { color: C.textDisabled, fontSize: 12, textAlign: 'center' },
  warningBanner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,107,53,0.12)',
    marginHorizontal: 16, borderRadius: 14, padding: 14, gap: 12, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(255,107,53,0.25)',
  },
  warningIcon: { fontSize: 24 },
  warningText: { flex: 1 },
  warningTitle: { color: C.warn, fontSize: 13, fontWeight: '700', marginBottom: 4 },
  warningDesc: { color: C.textSecondary, fontSize: 11, lineHeight: 16 },
  disputeBanner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.card,
    marginHorizontal: 16, borderRadius: 14, padding: 14, gap: 12, marginTop: 16,
    borderWidth: 1, borderColor: C.border,
  },
  disputeIcon: { fontSize: 24 },
  disputeText: { flex: 1 },
  disputeTitle: { color: C.text, fontSize: 13, fontWeight: '700' },
  disputeDesc: { color: C.textSecondary, fontSize: 11, marginTop: 2 },
  disputeArrow: { color: C.gold, fontSize: 18, fontWeight: '700' },
});

export default WalletScreen;
