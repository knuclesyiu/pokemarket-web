import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Image,
  TouchableOpacity, FlatList, Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { collection, doc, getDocs } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { MOCK_PORTFOLIO, MOCK_CARDS } from '../data/mockData';
import { PortfolioItem } from '../types';

type NavProp = NativeStackNavigationProp<any>;

const PortfolioScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const [showAddModal, setShowAddModal] = useState(false);
  const [addCardId, setAddCardId] = useState('');
  const [addQty, setAddQty] = useState('1');

  // FIRESTORE: real data — portfolio items state (falls back to MOCK_PORTFOLIO)
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>(MOCK_PORTFOLIO);

  // FIRESTORE: real data — load portfolio from Firestore users/{uid}/portfolio
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const loadPortfolio = async () => {
      try {
        const snap = await getDocs(collection(db, 'users', uid, 'portfolio'));
        if (snap.empty) return;

        const loaded: PortfolioItem[] = snap.docs.map(d => {
          const data = d.data() as { cardId: string; quantity: number; avgBuyPrice: number };
          const card = MOCK_CARDS.find(c => c.id === data.cardId) ?? MOCK_CARDS[0];
          const currentPrice = card.price;
          const currentValue = data.quantity * currentPrice;
          const totalCost = data.quantity * data.avgBuyPrice;
          const pnl = currentValue - totalCost;
          const pnlPercent = totalCost > 0 ? (pnl / totalCost) * 100 : 0;
          return {
            card,
            quantity: data.quantity,
            avgBuyPrice: data.avgBuyPrice,
            currentValue,
            pnl,
            pnlPercent,
          };
        });

        if (loaded.length > 0) setPortfolioItems(loaded);
      } catch (e) {
        console.warn('[Portfolio] Firestore load failed, using mock data:', e);
      }
    };

    loadPortfolio();
  }, []);

  const totalValue = portfolioItems.reduce((s, i) => s + i.currentValue, 0);
  const totalCost = portfolioItems.reduce((s, i) => s + i.avgBuyPrice * i.quantity, 0);
  const totalPnL = totalValue - totalCost;
  const totalPnLPercent = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;
  const isGain = totalPnL >= 0;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>我的收藏</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)}>
          <Text style={styles.addBtnText}>+ 添加</Text>
        </TouchableOpacity>
      </View>

      {/* Portfolio Summary — Obsidian Gallery: elevated card with gold accent border */}
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
            <Text style={styles.summarySubValue}>{portfolioItems.length}</Text>
          </View>
        </View>
      </View>

      {/* Holdings */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>💼 持有卡牌</Text>
        <Text style={styles.count}>{portfolioItems.length} 張</Text>
      </View>

      {portfolioItems.map((item: PortfolioItem) => (
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

      {/* Floating Sell Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          const nav = navigation as any;
          if (nav.navigate) nav.navigate('CardDetail', {});
        }}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>📦 放售卡牌</Text>
      </TouchableOpacity>

      {/* Add Card Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={addModalStyles.overlay}>
          <View style={addModalStyles.sheet}>
            <View style={addModalStyles.handle} />
            <Text style={addModalStyles.title}>添加卡牌</Text>
            <View style={addModalStyles.field}>
              <Text style={addModalStyles.label}>卡牌 ID</Text>
              <View style={addModalStyles.input}>
                <Text style={addModalStyles.inputText}>{addCardId || ' '}</Text>
              </View>
            </View>
            <View style={addModalStyles.field}>
              <Text style={addModalStyles.label}>數量</Text>
              <View style={addModalStyles.input}>
                <Text style={addModalStyles.inputText}>{addQty || ' '}</Text>
              </View>
            </View>
            <Text style={addModalStyles.hint}>
              請輸入卡牌 ID 和數量以添加到投資組合。
            </Text>
            <TouchableOpacity
              style={addModalStyles.confirmBtn}
              onPress={() => {
                setShowAddModal(false);
                setAddCardId('');
                setAddQty('1');
              }}
            >
              <Text style={addModalStyles.confirmBtnText}>確認添加</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[addModalStyles.cancelBtn]}
              onPress={() => setShowAddModal(false)}
            >
              <Text style={addModalStyles.cancelText}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  addBtn: {
    backgroundColor: '#D4AF37',   // NEW: gold primary CTA
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addBtnText: { color: '#080810', fontSize: 13, fontWeight: '700' },
  summaryCard: {
    backgroundColor: '#14142A',   // NEW: elevated card surface
    marginHorizontal: 16,
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2A2A50',        // NEW: subtle border
    // NEW: premium elevation shadow with warm gold tint
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8,
  },
  summaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  summaryLabel: { color: '#8888CC', fontSize: 12 },
  summaryValue: { color: '#F0F0FF', fontSize: 28, fontWeight: '800', marginTop: 4, letterSpacing: -1 },
  pnlBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  pnlGain: { backgroundColor: 'rgba(0,200,150,0.15)' },   // NEW: jade tint
  pnlLoss: { backgroundColor: 'rgba(255,64,96,0.15)' },   // NEW: ruby tint
  pnlBadgeText: { fontSize: 12, fontWeight: '700' },
  pnlGainText: { color: '#00C896' },   // NEW: jade accent
  pnlLossText: { color: '#FF4060' },    // NEW: ruby accent
  summaryBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#2A2A50',
    paddingTop: 14,
  },
  summarySub: { color: '#8888CC', fontSize: 10 },
  summarySubValue: { color: '#F0F0FF', fontSize: 14, fontWeight: '700', marginTop: 2 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 20,
    marginBottom: 12,
  },
  sectionTitle: { color: '#F0F0FF', fontSize: 16, fontWeight: '700' },
  count: { color: '#8888CC', fontSize: 12 },
  holdingCard: {
    flexDirection: 'row',
    backgroundColor: '#14142A',     // NEW: elevated card
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2A50',
    // NEW: card elevation
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  holdingImage: {
    width: 80,
    height: 112,
    backgroundColor: '#1C1C38',
  },
  holdingInfo: { flex: 1, padding: 12 },
  holdingName: { color: '#F0F0FF', fontSize: 14, fontWeight: '700' },
  holdingSet: { color: '#8888CC', fontSize: 10, marginTop: 2 },
  holdingBottom: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  holdingLabel: { color: '#8888CC', fontSize: 9 },
  holdingQty: { color: '#F0F0FF', fontSize: 13, fontWeight: '600' },
  holdingAvg: { color: '#F0F0FF', fontSize: 13, fontWeight: '600' },
  holdingValue: { color: '#D4AF37', fontSize: 13, fontWeight: '700' },   // NEW: gold price
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
    borderBottomColor: '#1C1C38',
  },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  fab: {
    position: 'absolute', bottom: 90, right: 16, left: 16,
    backgroundColor: '#D4AF37', borderRadius: 14, paddingVertical: 16,   // NEW: gold CTA
    alignItems: 'center',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  fabText: { color: '#080810', fontSize: 15, fontWeight: '800' },
  txBuy: { backgroundColor: 'rgba(255,64,96,0.15)' },   // NEW: ruby tint
  txSell: { backgroundColor: 'rgba(0,200,150,0.15)' },  // NEW: jade tint
  txIconText: { fontSize: 16 },
  txInfo: { flex: 1 },
  txCard: { color: '#F0F0FF', fontSize: 13, fontWeight: '600' },
  txDate: { color: '#8888CC', fontSize: 10, marginTop: 2 },
  txPrice: { fontSize: 14, fontWeight: '700' },
});

// NEW: Obsidian Gallery design system
const addModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1C1C38',    // NEW: elevated surface
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: '#2A2A50',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3D3D70',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: { color: '#F0F0FF', fontSize: 18, fontWeight: '800', marginBottom: 20 },
  field: { marginBottom: 16 },
  label: { color: '#8888CC', fontSize: 12, marginBottom: 6 },
  input: {
    backgroundColor: '#14142A',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#2A2A50',
  },
  inputText: { color: '#F0F0FF', fontSize: 14 },
  hint: { color: '#8888CC', fontSize: 11, marginBottom: 20, lineHeight: 16 },
  confirmBtn: {
    backgroundColor: '#D4AF37',    // NEW: gold CTA
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  confirmBtnText: { color: '#080810', fontSize: 15, fontWeight: '700' },
  cancelBtn: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#D4AF37',
    borderRadius: 14,
    paddingVertical: 14,
  },
  cancelText: { color: '#D4AF37', fontSize: 14, fontWeight: '600' },
});

export default PortfolioScreen;