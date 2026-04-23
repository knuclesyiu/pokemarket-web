import React from 'react';
import {
  View, Text, ScrollView, StyleSheet, Image,
  TouchableOpacity, FlatList,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MOCK_PORTFOLIO } from '../data/mockData';
import { PortfolioItem } from '../types';

type NavProp = NativeStackNavigationProp<any>;

const PortfolioScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();

  const totalValue = MOCK_PORTFOLIO.reduce((s, i) => s + i.currentValue, 0);
  const totalCost = MOCK_PORTFOLIO.reduce((s, i) => s + i.avgBuyPrice * i.quantity, 0);
  const totalPnL = totalValue - totalCost;
  const totalPnLPercent = ((totalValue - totalCost) / totalCost) * 100;
  const isGain = totalPnL >= 0;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>我的收藏</Text>
        <TouchableOpacity style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ 添加</Text>
        </TouchableOpacity>
      </View>

      {/* Portfolio Summary */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryTop}>
          <View>
            <Text style={styles.summaryLabel}>總市值</Text>
            <Text style={styles.summaryValue}>HK$ {totalValue.toLocaleString()}</Text>
          </View>
          <View style={[styles.pnlBadge, isGain ? styles.pnlGain : styles.pnlLoss]}>
            <Text style={[styles.pnlBadgeText, isGain ? styles.pnlGainText : styles.pnlLossText]}>
              {isGain ? '▲' : '▼'} {Math.abs(totalPnLPercent).toFixed(1)}%
            </Text>
          </View>
        </View>
        <View style={styles.summaryBottom}>
          <View>
            <Text style={styles.summarySub}>成本</Text>
            <Text style={styles.summarySubValue}>HK$ {totalCost.toLocaleString()}</Text>
          </View>
          <View>
            <Text style={styles.summarySub}>帳面盈虧</Text>
            <Text style={[styles.summarySubValue, isGain ? styles.pnlGainText : styles.pnlLossText]}>
              {isGain ? '+' : ''}{totalPnL.toLocaleString()}
            </Text>
          </View>
          <View>
            <Text style={styles.summarySub}>卡牌數量</Text>
            <Text style={styles.summarySubValue}>{MOCK_PORTFOLIO.length}</Text>
          </View>
        </View>
      </View>

      {/* Holdings */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>💼 持有卡牌</Text>
        <Text style={styles.count}>{MOCK_PORTFOLIO.length} 張</Text>
      </View>

      {MOCK_PORTFOLIO.map((item: PortfolioItem) => (
        <TouchableOpacity
          key={item.card.id}
          style={styles.holdingCard}
          onPress={() => navigation.navigate('CardDetail', { card: item.card })}
          activeOpacity={0.7}
        >
          <Image source={{ uri: item.card.imageUrl }} style={styles.holdingImage} />
          <View style={styles.holdingInfo}>
            <Text style={styles.holdingName} numberOfLines={1}>{item.card.name}</Text>
            <Text style={styles.holdingSet}>{item.card.set}</Text>
            <View style={styles.holdingBottom}>
              <View>
                <Text style={styles.holdingLabel}>持有</Text>
                <Text style={styles.holdingQty}>{item.quantity}x</Text>
              </View>
              <View>
                <Text style={styles.holdingLabel}>均價</Text>
                <Text style={styles.holdingAvg}>HK${item.avgBuyPrice.toLocaleString()}</Text>
              </View>
              <View>
                <Text style={styles.holdingLabel}>現值</Text>
                <Text style={styles.holdingValue}>HK${item.currentValue.toLocaleString()}</Text>
                {item.pnlPercent >= 50 && (
                  <Text style={styles.holdingTrophy}>🏆</Text>
                )}
              </View>
            </View>
          </View>
          <View style={styles.pnlSection}>
            <Text style={[styles.pnlAmount, item.pnl >= 0 ? styles.pnlGainText : styles.pnlLossText]}>
              {item.pnl >= 0 ? '+' : ''}{item.pnl.toLocaleString()}
            </Text>
            <Text style={[styles.pnlPct, item.pnl >= 0 ? styles.pnlGainText : styles.pnlLossText]}>
              {item.pnl >= 0 ? '▲' : '▼'} {Math.abs(item.pnlPercent).toFixed(1)}%
            </Text>
          </View>
        </TouchableOpacity>
      ))}

      {/* Transaction History */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>📜 成交記錄</Text>
      </View>
      {[
        { type: 'buy', card: 'Charizard VMAX', price: 4100, date: '2 小時前' },
        { type: 'sell', card: 'Gengar VMAX', price: 2950, date: '1 日前' },
        { type: 'sell', card: 'Tyranitar VMAX', price: 1050, date: '3 日前' },
      ].map((tx, i) => (
        <View key={i} style={styles.txRow}>
          <View style={[styles.txIcon, tx.type === 'buy' ? styles.txBuy : styles.txSell]}>
            <Text style={styles.txIconText}>{tx.type === 'buy' ? '↓' : '↑'}</Text>
          </View>
          <View style={styles.txInfo}>
            <Text style={styles.txCard}>{tx.card}</Text>
            <Text style={styles.txDate}>{tx.date}</Text>
          </View>
          <Text style={[styles.txPrice, tx.type === 'sell' ? styles.pnlGainText : styles.pnlLossText]}>
            {tx.type === 'sell' ? '+' : '-'}HK${tx.price.toLocaleString()}
          </Text>
        </View>
      ))}

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
  addBtn: {
    backgroundColor: '#FF3C3C',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  summaryCard: {
    backgroundColor: '#1E1E2E',
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FF3C3C33',
  },
  summaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  summaryLabel: { color: '#8888AA', fontSize: 12 },
  summaryValue: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', marginTop: 4 },
  pnlBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  pnlGain: { backgroundColor: 'rgba(0,200,100,0.15)' },
  pnlLoss: { backgroundColor: 'rgba(255,60,60,0.15)' },
  pnlBadgeText: { fontSize: 12, fontWeight: '700' },
  pnlGainText: { color: '#00C864' },
  pnlLossText: { color: '#FF3C3C' },
  summaryBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#2A2A3E',
    paddingTop: 14,
  },
  summarySub: { color: '#8888AA', fontSize: 10 },
  summarySubValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', marginTop: 2 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 20,
    marginBottom: 12,
  },
  sectionTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  count: { color: '#8888AA', fontSize: 12 },
  holdingCard: {
    flexDirection: 'row',
    backgroundColor: '#1E1E2E',
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 10,
    alignItems: 'center',
  },
  holdingImage: {
    width: 80,
    height: 112,
    backgroundColor: '#2A2A3E',
  },
  holdingInfo: { flex: 1, padding: 12 },
  holdingName: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  holdingSet: { color: '#8888AA', fontSize: 10, marginTop: 2 },
  holdingBottom: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  holdingLabel: { color: '#6666AA', fontSize: 9 },
  holdingQty: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  holdingAvg: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  holdingValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  holdingTrophy: { fontSize: 14, marginLeft: 4 },
  pnlSection: {
    paddingRight: 14,
    alignItems: 'flex-end',
  },
  pnlAmount: { fontSize: 14, fontWeight: '700' },
  pnlPct: { fontSize: 11, marginTop: 2 },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E2E',
  },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  txBuy: { backgroundColor: 'rgba(255,60,60,0.15)' },
  txSell: { backgroundColor: 'rgba(0,200,100,0.15)' },
  txIconText: { fontSize: 16 },
  txInfo: { flex: 1 },
  txCard: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  txDate: { color: '#8888AA', fontSize: 10, marginTop: 2 },
  txPrice: { fontSize: 14, fontWeight: '700' },
});

export default PortfolioScreen;
