import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  FlatList,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

type NavProp = NativeStackNavigationProp<any>;

type EscrowState = 'pending' | 'in_escrow' | 'released';

interface WalletData {
  balance: number;
  pendingEscrow: number;
  onboardingComplete: boolean;
}

interface EscrowTransaction {
  id: string;
  type: 'buy' | 'sell';
  cardName: string;
  cardImage: string;
  counterparty: string;
  amount: number;
  state: EscrowState;
  date: string;
  daysLeft?: number;
  autoReleaseAt?: number;
}

const MOCK_TRANSACTIONS: EscrowTransaction[] = [
  {
    id: 't1', type: 'sell', cardName: 'Charizard VMAX',
    cardImage: 'https://images.pokemontcg.io/swsh5/115.png',
    counterparty: 'CardMaster_HK', amount: 4200,
    state: 'in_escrow', date: '2 小時前', daysLeft: 2,
    autoReleaseAt: Date.now() + 3 * 24 * 60 * 60 * 1000,
  },
  {
    id: 't2', type: 'sell', cardName: 'Gengar VMAX',
    cardImage: 'https://images.pokemontcg.io/swsh12/71.png',
    counterparty: 'PokemonCollector', amount: 3150,
    state: 'released', date: '1 日前',
  },
  {
    id: 't3', type: 'buy', cardName: 'Umbreon VMAX',
    cardImage: 'https://images.pokemontcg.io/swsh12/215.png',
    counterparty: 'RareCards_HK', amount: 3420,
    state: 'pending', date: '30 分鐘前',
  },
  {
    id: 't4', type: 'sell', cardName: 'Tyranitar VMAX',
    cardImage: 'https://images.pokemontcg.io/swsh4/116.png',
    counterparty: 'HKCardDealer', amount: 980,
    state: 'released', date: '3 日前',
  },
];

// NEW: Obsidian Gallery — jade/ruby state colors, gold active tab
const STATE_LABELS: Record<EscrowState, { zh: string; color: string; bg: string }> = {
  pending: { zh: '待確認', color: '#D4AF37', bg: 'rgba(212,175,55,0.15)' },
  in_escrow: { zh: '託付中', color: '#FF6B35', bg: 'rgba(255,107,53,0.15)' },
  released: { zh: '已完成', color: '#00C896', bg: 'rgba(0,200,150,0.15)' },
};

const WalletScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const [activeTab, setActiveTab] = useState<EscrowState | 'all'>('all');

  // FIRESTORE: real data — wallet state (falls back to mock data)
  const [walletData, setWalletData] = useState<WalletData>({
    balance: 12430,
    pendingEscrow: 4200,
    onboardingComplete: false,
  });

  // FIRESTORE: real data — load wallet from Firestore users/{uid}/wallet
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const loadWallet = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', uid, 'wallet'));
        if (snap.exists()) {
          const data = snap.data() as WalletData;
          setWalletData({
            balance: data.balance ?? 12430,
            pendingEscrow: data.pendingEscrow ?? 0,
            onboardingComplete: data.onboardingComplete ?? false,
          });
        }
      } catch (e) {
        console.warn('[Wallet] Firestore load failed, using mock data:', e);
      }
    };

    loadWallet();
  }, []);

  const balance = walletData.balance;
  const inEscrow = walletData.pendingEscrow;
  const available = balance - inEscrow;

  const filtered = activeTab === 'all'
    ? MOCK_TRANSACTIONS
    : MOCK_TRANSACTIONS.filter(t => t.state === activeTab);

  const tabs: { key: EscrowState | 'all'; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: MOCK_TRANSACTIONS.length },
    { key: 'pending', label: '待確認', count: MOCK_TRANSACTIONS.filter(t => t.state === 'pending').length },
    { key: 'in_escrow', label: '託付中', count: MOCK_TRANSACTIONS.filter(t => t.state === 'in_escrow').length },
    { key: 'released', label: '已完成', count: MOCK_TRANSACTIONS.filter(t => t.state === 'released').length },
  ];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>我的錢包</Text>
        <TouchableOpacity style={styles.settingsBtn}>
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* Balance Card — premium bank app feel with gold CTA */}
      <View style={styles.balanceCard}>
        <View style={styles.balanceHeader}>
          <View>
            <Text style={styles.balanceLabel}>可提現餘額</Text>
            <Text style={styles.balanceValue}>HK$ {available.toLocaleString()}</Text>
          </View>
          <View style={styles.balanceActions}>
            <TouchableOpacity style={styles.topupBtn} onPress={() => {}}>
              <Text style={styles.topupBtnText}>↑ 充值</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.withdrawBtn} onPress={() => {}}>
              <Text style={styles.withdrawBtnText}>提現 →</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.balanceDivider} />
        <View style={styles.balanceSub}>
          <View style={styles.balanceSubItem}>
            <Text style={styles.balanceSubLabel}>🔒 擔保中</Text>
            <Text style={styles.balanceSubValue}>HK$ {inEscrow.toLocaleString()}</Text>
          </View>
          <View style={styles.balanceSubItem}>
            <Text style={styles.balanceSubLabel}>💰 總結餘</Text>
            <Text style={styles.balanceSubValue}>HK$ {balance.toLocaleString()}</Text>
          </View>
        </View>
        {/* FPS badge */}
        <View style={styles.fpsBadge}>
          <Text style={styles.fpsBadgeText}>FPS 轉數快已連結</Text>
        </View>
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

      {/* Escrow warning banner */}
      {filtered.filter(t => t.state === 'in_escrow' && t.autoReleaseAt && t.autoReleaseAt - Date.now() < 5 * 24 * 60 * 60 * 1000).length > 0 && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningIcon}>⚠️</Text>
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
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
            {tab.count > 0 && (
              <View style={[styles.tabBadge, activeTab === tab.key && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, activeTab === tab.key && styles.tabBadgeTextActive]}>
                  {tab.count}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Transaction list */}
      <View style={styles.txList}>
        {filtered.map(tx => {
          const state = STATE_LABELS[tx.state];
          return (
            <TouchableOpacity
              key={tx.id}
              style={styles.txCard}
              onPress={() => navigation.navigate('OrderStatus', { txId: tx.id })}
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
                <Text style={styles.txDate}>{tx.date}</Text>
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
                {tx.daysLeft && (
                  <Text style={styles.daysLeft}>還剩 {tx.daysLeft} 日</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}

        {filtered.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>暫時沒有記錄</Text>
          </View>
        )}
      </View>

      {/* Dispute banner */}
      <TouchableOpacity style={styles.disputeBanner}>
        <Text style={styles.disputeIcon}>🛡️</Text>
        <View style={styles.disputeText}>
          <Text style={styles.disputeTitle}>交易爭議？</Text>
          <Text style={styles.disputeDesc}>如遇問題，可提出爭議，平台將在 24 小時內審查</Text>
        </View>
        <Text style={styles.disputeArrow}>→</Text>
      </TouchableOpacity>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
};

// NEW: Obsidian Gallery design system
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080810' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
  },
  headerTitle: { color: '#F0F0FF', fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  settingsBtn: {
    width: 40, height: 40,
    borderRadius: 12,
    backgroundColor: '#14142A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2A2A50',
  },
  settingsIcon: { fontSize: 18 },
  // NEW: elevated balance card with gold CTA
  balanceCard: {
    backgroundColor: '#14142A',
    marginHorizontal: 16,
    borderRadius: 24,
    padding: 24,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A2A50',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  balanceLabel: { color: '#8888CC', fontSize: 12 },
  balanceValue: {
    color: '#F0F0FF',
    fontSize: 32,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: -1,
  },
  balanceActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  topupBtn: {
    backgroundColor: '#14142A',
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1, borderColor: '#D4AF37',
  },
  topupBtnText: { color: '#D4AF37', fontSize: 12, fontWeight: '700' },
  withdrawBtn: {
    backgroundColor: '#D4AF37',   // NEW: gold CTA
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20,
  },
  withdrawBtnText: { color: '#080810', fontSize: 12, fontWeight: '700' },
  balanceDivider: {
    height: 1,
    backgroundColor: '#2A2A50',
    marginVertical: 14,
  },
  balanceSub: { flexDirection: 'row', gap: 24 },
  balanceSubItem: {},
  balanceSubLabel: { color: '#8888CC', fontSize: 11 },
  balanceSubValue: { color: '#F0F0FF', fontSize: 14, fontWeight: '700', marginTop: 2 },
  fpsBadge: {
    backgroundColor: 'rgba(0,150,255,0.12)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,150,255,0.2)',
  },
  fpsBadgeText: { color: '#0096FF', fontSize: 11, fontWeight: '600' },
  escrowInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212,175,55,0.08)',
    marginHorizontal: 16,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.2)',
  },
  escrowIcon: { fontSize: 24 },
  escrowText: { flex: 1 },
  escrowTitle: { color: '#D4AF37', fontSize: 13, fontWeight: '700', marginBottom: 4 },
  escrowDesc: { color: '#8888CC', fontSize: 11, lineHeight: 16 },
  // NEW: gold active tab
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 6,
    marginBottom: 14,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#14142A',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  tabActive: {
    backgroundColor: '#D4AF37',   // NEW: gold active
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  tabText: { color: '#8888CC', fontSize: 11, fontWeight: '600' },
  tabTextActive: { color: '#080810', fontWeight: '700' },
  tabBadge: {
    width: 16, height: 16,
    borderRadius: 8,
    backgroundColor: '#2A2A50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeActive: { backgroundColor: 'rgba(0,0,0,0.2)' },
  tabBadgeText: { color: '#8888CC', fontSize: 9, fontWeight: '700' },
  tabBadgeTextActive: { color: '#080810' },
  txList: { paddingHorizontal: 16, gap: 8, display: 'flex' },
  // NEW: elevated tx card
  txCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#14142A',
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: '#2A2A50',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  txIcon: {
    width: 40, height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txBuyIcon: { backgroundColor: 'rgba(255,64,96,0.15)' },   // NEW: ruby
  txSellIcon: { backgroundColor: 'rgba(0,200,150,0.15)' },   // NEW: jade
  txIconText: { fontSize: 18, fontWeight: '700' },
  txInfo: { flex: 1 },
  txCardName: { color: '#F0F0FF', fontSize: 13, fontWeight: '700' },
  txCounterparty: { color: '#8888CC', fontSize: 11, marginTop: 2 },
  txDate: { color: '#4A4A70', fontSize: 10, marginTop: 2 },
  txRight: { alignItems: 'flex-end', gap: 4 },
  txAmount: { fontSize: 15, fontWeight: '700' },
  txAmountSell: { color: '#00C896' },   // NEW: jade
  txAmountBuy: { color: '#FF4060' },    // NEW: ruby
  stateBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  stateBadgeText: { fontSize: 10, fontWeight: '700' },
  daysLeft: { color: '#FF6B35', fontSize: 10 },   // NEW: ember
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 40, marginBottom: 8 },
  emptyText: { color: '#8888CC', fontSize: 14 },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,107,53,0.12)',
    marginHorizontal: 16,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.25)',
  },
  warningIcon: { fontSize: 24 },
  warningText: { flex: 1 },
  warningTitle: { color: '#FF6B35', fontSize: 13, fontWeight: '700', marginBottom: 4 },
  warningDesc: { color: '#8888CC', fontSize: 11, lineHeight: 16 },
  disputeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#14142A',
    marginHorizontal: 16,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#2A2A50',
  },
  disputeIcon: { fontSize: 24 },
  disputeText: { flex: 1 },
  disputeTitle: { color: '#F0F0FF', fontSize: 13, fontWeight: '700' },
  disputeDesc: { color: '#8888CC', fontSize: 11, marginTop: 2 },
  disputeArrow: { color: '#D4AF37', fontSize: 18, fontWeight: '700' },
});

export default WalletScreen;