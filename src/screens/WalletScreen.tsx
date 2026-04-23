import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  FlatList,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type NavProp = NativeStackNavigationProp<any>;

type EscrowState = 'pending' | 'in_escrow' | 'released';

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
}

const MOCK_TRANSACTIONS: EscrowTransaction[] = [
  {
    id: 't1', type: 'sell', cardName: 'Charizard VMAX',
    cardImage: 'https://images.pokemontcg.io/swsh5/115.png',
    counterparty: 'CardMaster_HK', amount: 4200,
    state: 'in_escrow', date: '2 小時前', daysLeft: 2,
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

const STATE_LABELS: Record<EscrowState, { zh: string; color: string; bg: string }> = {
  pending: { zh: '待確認', color: '#FFB800', bg: 'rgba(255,184,0,0.15)' },
  in_escrow: { zh: '擔保中', color: '#FF3C3C', bg: 'rgba(255,60,60,0.15)' },
  released: { zh: '已完成', color: '#00C864', bg: 'rgba(0,200,100,0.15)' },
};

const WalletScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const [activeTab, setActiveTab] = useState<EscrowState | 'all'>('all');

  const balance = 12430;
  const inEscrow = 4200;
  const available = balance - inEscrow;

  const filtered = activeTab === 'all'
    ? MOCK_TRANSACTIONS
    : MOCK_TRANSACTIONS.filter(t => t.state === activeTab);

  const tabs: { key: EscrowState | 'all'; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: MOCK_TRANSACTIONS.length },
    { key: 'pending', label: '待確認', count: MOCK_TRANSACTIONS.filter(t => t.state === 'pending').length },
    { key: 'in_escrow', label: '擔保中', count: MOCK_TRANSACTIONS.filter(t => t.state === 'in_escrow').length },
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

      {/* Balance Card */}
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
        {/* FPS notice */}
        <View style={styles.fpsBadge}>
          <Text style={styles.fpsBadgeText}>FPS 轉數快已連結</Text>
        </View>
      </View>

      {/* Escrow explainer */}
      <View style={styles.escrowInfo}>
        <Text style={styles.escrowIcon}>🔐</Text>
        <View style={styles.escrowText}>
          <Text style={styles.escrowTitle}>資金由平台托管</Text>
          <Text style={styles.escrowDesc}>
            買家確認收卡後，款項先由平台持有，交易完成後才轉俾賣家，保障雙方
          </Text>
        </View>
      </View>

      {/* State tabs */}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#12121F' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
  },
  headerTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
  settingsBtn: {
    width: 40, height: 40,
    borderRadius: 12,
    backgroundColor: '#1E1E2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIcon: { fontSize: 18 },
  balanceCard: {
    backgroundColor: '#1E1E2E',
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FF3C3C33',
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  balanceLabel: { color: '#8888AA', fontSize: 12 },
  balanceValue: { color: '#FFFFFF', fontSize: 32, fontWeight: '800', marginTop: 4 },
  balanceActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  topupBtn: {
    backgroundColor: '#1E1E2E', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: '#2A2A3E',
  },
  topupBtnText: { color: '#FFD700', fontSize: 12, fontWeight: '700' },
  withdrawBtn: {
    backgroundColor: '#FF3C3C', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  withdrawBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  balanceDivider: {
    height: 1,
    backgroundColor: '#2A2A3E',
    marginVertical: 14,
  },
  balanceSub: { flexDirection: 'row', gap: 24 },
  balanceSubItem: {},
  balanceSubLabel: { color: '#8888AA', fontSize: 11 },
  balanceSubValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', marginTop: 2 },
  fpsBadge: {
    backgroundColor: 'rgba(0,150,255,0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
    marginTop: 12,
  },
  fpsBadgeText: { color: '#0096FF', fontSize: 11, fontWeight: '600' },
  escrowInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,184,0,0.08)',
    marginHorizontal: 16,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,184,0,0.2)',
  },
  escrowIcon: { fontSize: 24 },
  escrowText: { flex: 1 },
  escrowTitle: { color: '#FFB800', fontSize: 13, fontWeight: '700', marginBottom: 4 },
  escrowDesc: { color: '#8888AA', fontSize: 11, lineHeight: 16 },
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
    backgroundColor: '#1E1E2E',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  tabActive: { backgroundColor: '#FF3C3C' },
  tabText: { color: '#8888AA', fontSize: 11, fontWeight: '600' },
  tabTextActive: { color: '#FFFFFF' },
  tabBadge: {
    width: 16, height: 16,
    borderRadius: 8,
    backgroundColor: '#2A2A3E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  tabBadgeText: { color: '#8888AA', fontSize: 9, fontWeight: '700' },
  tabBadgeTextActive: { color: '#FFFFFF' },
  txList: { paddingHorizontal: 16, gap: 8, display: 'flex' },
  txCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E2E',
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  txIcon: {
    width: 40, height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txBuyIcon: { backgroundColor: 'rgba(255,60,60,0.15)' },
  txSellIcon: { backgroundColor: 'rgba(0,200,100,0.15)' },
  txIconText: { fontSize: 18, fontWeight: '700' },
  txInfo: { flex: 1 },
  txCardName: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  txCounterparty: { color: '#8888AA', fontSize: 11, marginTop: 2 },
  txDate: { color: '#6666AA', fontSize: 10, marginTop: 2 },
  txRight: { alignItems: 'flex-end', gap: 4 },
  txAmount: { fontSize: 15, fontWeight: '700' },
  txAmountSell: { color: '#00C864' },
  txAmountBuy: { color: '#FF3C3C' },
  stateBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  stateBadgeText: { fontSize: 10, fontWeight: '700' },
  daysLeft: { color: '#FFB800', fontSize: 10 },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 40, marginBottom: 8 },
  emptyText: { color: '#8888AA', fontSize: 14 },
  disputeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E2E',
    marginHorizontal: 16,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    marginTop: 16,
  },
  disputeIcon: { fontSize: 24 },
  disputeText: { flex: 1 },
  disputeTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  disputeDesc: { color: '#8888AA', fontSize: 11, marginTop: 2 },
  disputeArrow: { color: '#FF3C3C', fontSize: 18, fontWeight: '700' },
});

export default WalletScreen;
