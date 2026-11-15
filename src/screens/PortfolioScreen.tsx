import React, { useState, useEffect, useCallback, useRef } from 'react';
import { t } from '../i18n';
import { useAppearance } from '../contexts/AppearanceContext';
import {
  View, Text, TextInput, ScrollView, StyleSheet, Image,
  TouchableOpacity, FlatList, Modal,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { collection, doc, getDocs, getDoc, query, where, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

import { PortfolioItem } from '../types';
import { C, themed } from '../theme';
import Ionicons from '@expo/vector-icons/Ionicons';

type NavProp = NativeStackNavigationProp<any>;

const PortfolioScreen: React.FC = () => {
  const { t } = useAppearance();

  const navigation = useNavigation<NavProp>();
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<import('../types').PokemonCard[]>([]);
  const [selectedCard, setSelectedCard] = useState<import('../types').PokemonCard | null>(null);
  const [addQty, setAddQty] = useState('1');
  const [saving, setSaving] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>(
    []
  );

  // ── Card Search: real-time Firestore query ───────────────────────────
  const searchCards = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setSearchResults([]); return; }
    try {
      const q_lower = q.toLowerCase();
      const snap = await getDocs(
        query(collection(db, 'card_prices'), where('imageUrl', '!=', ''), where('priceHkd', '>', 0))
      );
      const results: import('../types').PokemonCard[] = [];
      snap.forEach(d => {
        const p = d.data();
        const name = (p.name ?? d.id).toLowerCase();
        if (name.includes(q_lower) || (p.set ?? '').toLowerCase().includes(q_lower)) {
          results.push({
            id: d.id, name: p.name ?? d.id, set: p.set ?? '', setCode: p.setCode ?? '',
            rarity: (p.rarity as any) ?? 'Common', series: p.series ?? 'Other', number: p.number ?? '',
            price: p.priceHkd ?? 0, priceChange24h: p.change24h ?? 0, imageUrl: p.imageUrl ?? '',
            condition: 'Near Mint' as any, language: (p.language as any) ?? 'English',
            listed: true, listingCount: 0,
          });
        }
        if (results.length >= 8) return;
      });
      setSearchResults(results.slice(0, 8));
    } catch (e) { console.warn('[Portfolio search]', e); }
  }, []);

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    setSelectedCard(null);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchCards(text), 300);
  };

  // Save selected card to Firestore portfolio
  const handleAddCard = async () => {
    if (!selectedCard || !auth.currentUser) return;
    setSaving(true);
    try {
      const qty = Math.max(1, parseInt(addQty) || 1);
      await setDoc(
        doc(db, 'users', auth.currentUser.uid, 'portfolio', selectedCard.id),
        { cardId: selectedCard.id, quantity: qty, avgBuyPrice: selectedCard.price, addedAt: Date.now() },
        { merge: true }
      );
      const newItem: PortfolioItem = {
        card: selectedCard, quantity: qty, avgBuyPrice: selectedCard.price,
        currentValue: qty * selectedCard.price,
        pnl: 0, pnlPercent: 0,
      };
      setPortfolioItems(prev => {
        const exists = prev.find(i => i.card.id === selectedCard!.id);
        if (exists) return prev.map(i => i.card.id === selectedCard!.id
          ? { ...i, quantity: i.quantity + qty, currentValue: (i.quantity + qty) * selectedCard!.price }
          : i);
        return [...prev, newItem];
      });
      setShowAddModal(false); setSearchQuery(''); setSearchResults([]); setSelectedCard(null); setAddQty('1');
    } catch (e) { console.warn('[Portfolio add]', e); }
    finally { setSaving(false); }
  };

  // FIRESTORE: real data — load portfolio from Firestore users/{uid}/portfolio
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const loadPortfolio = async () => {
      try {
        const snap = await getDocs(collection(db, 'users', uid, 'portfolio'));
        if (snap.empty) { setPortfolioItems([]); return; }

        const loaded: PortfolioItem[] = [];
        for (const d of snap.docs) {
          const data = d.data() as { cardId: string; quantity: number; avgBuyPrice: number };
          const cardSnap = await getDoc(doc(db, 'card_prices', data.cardId));
          if (!cardSnap.exists()) continue;
          const p = cardSnap.data();
          const card = {
            id: cardSnap.id, name: p.name ?? cardSnap.id, set: p.set ?? '', setCode: p.setCode ?? '',
            rarity: (p.rarity as any) ?? 'Common', series: p.series ?? 'Other', number: p.number ?? '',
            price: p.priceHkd ?? 0, priceChange24h: p.change24h ?? 0, imageUrl: p.imageUrl ?? '',
            condition: 'Near Mint' as any, language: (p.language as any) ?? 'English',
            listed: true, listingCount: 0,
          };
          const currentPrice = card.price;
          const currentValue = data.quantity * currentPrice;
          const totalCost = data.quantity * data.avgBuyPrice;
          const pnl = currentValue - totalCost;
          const pnlPercent = totalCost > 0 ? (pnl / totalCost) * 100 : 0;
          loaded.push({ card, quantity: data.quantity, avgBuyPrice: data.avgBuyPrice, currentValue, pnl, pnlPercent });
        }
        if (loaded.length > 0) setPortfolioItems(loaded);
      } catch (e) {
        console.warn('[Portfolio] Firestore load failed, using mock data:', e);
      }
    };

    loadPortfolio();
  }, []);

  // Re-evaluate PnL against live market prices every time the user
  // re-focuses this tab. Without this, PnL stays frozen at whatever
  // price was snapshotted in card_prices at last sync (up to 4 hours stale).
  const isFocusedRef = useRef(false);
  useFocusEffect(useCallback(() => {
    isFocusedRef.current = true;
    // Refresh live prices for each portfolio item
    if (portfolioItems.length === 0) return;
    (async () => {
      try {
        const updates = await Promise.all(
          portfolioItems.map(async (item) => {
            const cardSnap = await getDoc(doc(db, 'card_prices', item.card.id));
            if (!cardSnap.exists()) return null;
            const data = cardSnap.data() as any;
            const currentPrice = Number(data.priceHkd ?? data.cardmarketHkd ?? 0);
            const currentValue = currentPrice * item.quantity;
            const totalCost = item.avgBuyPrice * item.quantity;
            const pnl = currentValue - totalCost;
            const pnlPercent = totalCost > 0 ? (pnl / totalCost) * 100 : 0;
            return { id: item.card.id, currentValue, pnl, pnlPercent, currentPrice };
          })
        );
        setPortfolioItems(prev => prev.map(item => {
          const u = updates.find(x => x?.id === item.card.id);
          if (!u) return item;
          return { ...item, currentValue: u.currentValue, pnl: u.pnl, pnlPercent: u.pnlPercent, card: { ...item.card, price: u.currentPrice } };
        }));
      } catch (e) {
        console.warn('[Portfolio] live price refresh failed:', e);
      }
    })();
    return () => { isFocusedRef.current = false; };
  }, [portfolioItems.length]));

  const totalValue = portfolioItems.reduce((s, i) => s + i.currentValue, 0);
  const totalCost = portfolioItems.reduce((s, i) => s + i.avgBuyPrice * i.quantity, 0);
  const totalPnL = totalValue - totalCost;
  const totalPnLPercent = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;
  const isGain = totalPnL >= 0;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('我的收藏')}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)}>
          <Text style={styles.addBtnText}>{t('+ 添加')}</Text>
        </TouchableOpacity>
      </View>

      {/* Portfolio Summary — Obsidian Gallery: elevated card with gold accent border */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryTop}>
          <View>
            <Text style={styles.summaryLabel}>{t('總市值')}</Text>
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
            <Text style={styles.summarySub}>{t('成本')}</Text>
            <Text style={styles.summarySubValue}>HK$ {totalCost.toLocaleString()}</Text>
          </View>
          <View>
            <Text style={styles.summarySub}>{t('帳面盈虧')}</Text>
            <Text style={[styles.summarySubValue, isGain ? styles.pnlGainText : styles.pnlLossText]}>
              {isGain ? '+' : ''}{totalPnL.toLocaleString()}
            </Text>
          </View>
          <View>
            <Text style={styles.summarySub}>{t('卡牌數量')}</Text>
            <Text style={styles.summarySubValue}>{portfolioItems.length}</Text>
          </View>
        </View>
      </View>

      {/* Holdings */}
      <View style={styles.sectionHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="briefcase-outline" size={15} color={C.textTertiary} /><Text style={styles.sectionTitle}>{t('持有卡牌')}</Text></View>
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
                <Text style={styles.holdingLabel}>{t('持有')}</Text>
                <Text style={styles.holdingQty}>{item.quantity}x</Text>
              </View>
              <View>
                <Text style={styles.holdingLabel}>{t('均價')}</Text>
                <Text style={styles.holdingAvg}>HK${item.avgBuyPrice.toLocaleString()}</Text>
              </View>
              <View>
                <Text style={styles.holdingLabel}>{t('現值')}</Text>
                <Text style={styles.holdingValue}>HK${item.currentValue.toLocaleString()}</Text>
                {item.pnlPercent >= 50 && (
                  <Ionicons name="trophy-outline" size={14} color={C.textTertiary} />
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
        <Text style={styles.sectionTitle}>{t('📜 成交記錄')}</Text>
      </View>
      {[
        { type: 'buy', card: 'Charizard VMAX', price: 4100, date: t('2 小時前') },
        { type: 'sell', card: 'Gengar VMAX', price: 2950, date: t('1 日前') },
        { type: 'sell', card: 'Tyranitar VMAX', price: 1050, date: t('3 日前') },
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

      {/* Floating Sell Button — navigates to Sell screen with empty params,
          user picks the card from their portfolio inside Sell screen. */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          navigation.navigate('Sell', undefined);
        }}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>{t('📦 放售卡牌')}</Text>
      </TouchableOpacity>

      {/* ── P1.5: Real Card Add Modal with Firestore Search ── */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={addModalStyles.overlay}>
          <View style={addModalStyles.sheet}>
            <View style={addModalStyles.handle} />
            <Text style={addModalStyles.title}>{t('添加卡牌到收藏')}</Text>

            {/* Search Bar */}
            <View style={addModalStyles.searchWrap}>
              <Ionicons name="search-outline" size={16} color={C.textTertiary} />
              <TextInput
                style={addModalStyles.searchInput}
                placeholder={t('搜尋卡名...')}
                placeholderTextColor={C.textDisabled}
                value={searchQuery}
                onChangeText={handleSearchChange}
                autoFocus
              />
            </View>

            {/* Search Results */}
            {searchResults.length > 0 && !selectedCard && (
              <View style={addModalStyles.resultsList}>
                {searchResults.map(card => (
                  <TouchableOpacity
                    key={card.id}
                    style={addModalStyles.resultItem}
                    onPress={() => { setSelectedCard(card); setSearchResults([]); }}
                  >
                    <Image source={{ uri: card.imageUrl }} style={addModalStyles.resultThumb} />
                    <View style={{ flex: 1 }}>
                      <Text style={addModalStyles.resultName} numberOfLines={1}>{card.name}</Text>
                      <Text style={addModalStyles.resultSet}>{card.set}</Text>
                    </View>
                    <Text style={addModalStyles.resultPrice}>HK${card.price.toLocaleString()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Selected Card Preview */}
            {selectedCard && (
              <View style={addModalStyles.selectedCard}>
                <Image source={{ uri: selectedCard.imageUrl }} style={addModalStyles.selectedThumb} />
                <View style={{ flex: 1 }}>
                  <Text style={addModalStyles.selectedName}>{selectedCard.name}</Text>
                  <Text style={addModalStyles.selectedSet}>{selectedCard.set} · HK${selectedCard.price.toLocaleString()}</Text>
                </View>
                <TouchableOpacity onPress={() => { setSelectedCard(null); setSearchQuery(''); }}>
                  <Text style={{ color: C.ruby, fontSize: 13 }}>✕</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Quantity */}
            <View style={addModalStyles.field}>
              <Text style={addModalStyles.label}>{t('數量')}</Text>
              <View style={addModalStyles.qtyRow}>
                <TouchableOpacity style={addModalStyles.qtyBtn} onPress={() => setAddQty(v => String(Math.max(1, parseInt(v) - 1)))}>
                  <Text style={{ color: C.text, fontSize: 18 }}>−</Text>
                </TouchableOpacity>
                <TextInput
                  style={addModalStyles.qtyInput}
                  value={addQty}
                  onChangeText={setAddQty}
                  keyboardType="number-pad"
                  textAlign="center"
                />
                <TouchableOpacity style={addModalStyles.qtyBtn} onPress={() => setAddQty(v => String(parseInt(v || '1') + 1))}>
                  <Text style={{ color: C.text, fontSize: 18 }}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {selectedCard && (
              <Text style={addModalStyles.totalText}>
                總值：HK$ {(parseInt(addQty) * selectedCard.price).toLocaleString()}
              </Text>
            )}

            <TouchableOpacity
              style={[addModalStyles.confirmBtn, (!selectedCard || saving) ? addModalStyles.confirmBtnDisabled : null]}
              onPress={handleAddCard}
              disabled={!selectedCard || saving}
            >
              <Text style={addModalStyles.confirmBtnText}>{saving ? t('保存中...') : t('確認添加')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[addModalStyles.cancelBtn]} onPress={() => { setShowAddModal(false); setSearchQuery(''); setSearchResults([]); setSelectedCard(null); }}>
              <Text style={addModalStyles.cancelText}>{t('取消')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
};

// NEW: Obsidian Gallery design system
const styles = themed((C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.void },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
  },
  headerTitle: { color: C.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  addBtn: {
    backgroundColor: C.action,   // NEW: gold primary CTA
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addBtnText: { color: C.void, fontSize: 13, fontWeight: '700' },
  summaryCard: {
    backgroundColor: C.card,   // NEW: elevated card surface
    marginHorizontal: 16,
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: C.border,        // NEW: subtle border
    // NEW: premium elevation shadow with warm gold tint
    shadowColor: C.action,
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
  summaryLabel: { color: C.textSecondary, fontSize: 12 },
  summaryValue: { color: C.text, fontSize: 28, fontWeight: '800', marginTop: 4, letterSpacing: -1 },
  pnlBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  pnlGain: { backgroundColor: 'rgba(0,200,150,0.15)' },   // NEW: jade tint
  pnlLoss: { backgroundColor: 'rgba(255,64,96,0.15)' },   // NEW: ruby tint
  pnlBadgeText: { fontSize: 12, fontWeight: '700' },
  pnlGainText: { color: C.up },   // NEW: jade accent
  pnlLossText: { color: C.ruby },    // NEW: ruby accent
  summaryBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 14,
  },
  summarySub: { color: C.textSecondary, fontSize: 10 },
  summarySubValue: { color: C.text, fontSize: 14, fontWeight: '700', marginTop: 2 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 20,
    marginBottom: 12,
  },
  sectionTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
  count: { color: C.textSecondary, fontSize: 12 },
  holdingCard: {
    flexDirection: 'row',
    backgroundColor: C.card,     // NEW: elevated card
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
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
    backgroundColor: C.elevated,
  },
  holdingInfo: { flex: 1, padding: 12 },
  holdingName: { color: C.text, fontSize: 14, fontWeight: '700' },
  holdingSet: { color: C.textSecondary, fontSize: 10, marginTop: 2 },
  holdingBottom: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  holdingLabel: { color: C.textSecondary, fontSize: 9 },
  holdingQty: { color: C.text, fontSize: 13, fontWeight: '600' },
  holdingAvg: { color: C.text, fontSize: 13, fontWeight: '600' },
  holdingValue: { color: C.action, fontSize: 13, fontWeight: '700' },   // NEW: gold price
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
    borderBottomColor: C.elevated,
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
    backgroundColor: C.action, borderRadius: 14, paddingVertical: 16,   // NEW: gold CTA
    alignItems: 'center',
    shadowColor: C.action,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  fabText: { color: C.void, fontSize: 15, fontWeight: '800' },
  txBuy: { backgroundColor: 'rgba(255,64,96,0.15)' },   // NEW: ruby tint
  txSell: { backgroundColor: 'rgba(0,200,150,0.15)' },  // NEW: jade tint
  txIconText: { fontSize: 16 },
  txInfo: { flex: 1 },
  txCard: { color: C.text, fontSize: 13, fontWeight: '600' },
  txDate: { color: C.textSecondary, fontSize: 10, marginTop: 2 },
  txPrice: { fontSize: 14, fontWeight: '700' },
}))

// NEW: Obsidian Gallery design system
const addModalStyles = themed((C) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.elevated,    // NEW: elevated surface
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: C.border,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.borderActive,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: { color: C.text, fontSize: 18, fontWeight: '800', marginBottom: 20 },
  field: { marginBottom: 16 },
  label: { color: C.textSecondary, fontSize: 12, marginBottom: 6 },
  input: {
    backgroundColor: C.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  inputText: { color: C.text, fontSize: 14 },
  hint: { color: C.textSecondary, fontSize: 11, marginBottom: 20, lineHeight: 16 },
  confirmBtn: {
    backgroundColor: C.action,    // NEW: gold CTA
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  confirmBtnText: { color: C.void, fontSize: 15, fontWeight: '700' },
  cancelBtn: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: C.action,
    borderRadius: 14,
    paddingVertical: 14,
  },
  cancelText: { color: C.action, fontSize: 14, fontWeight: '600' },
  confirmBtnDisabled: { opacity: 0.4 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: C.border, marginBottom: 12,
  },
  searchInput: { flex: 1, color: C.text, fontSize: 14 },
  resultsList: { maxHeight: 220, marginBottom: 12 },
  resultItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: C.elevated,
  },
  resultThumb: { width: 40, height: 56, borderRadius: 6, backgroundColor: C.card, marginRight: 10 },
  resultName: { color: C.text, fontSize: 13, fontWeight: '600' },
  resultSet: { color: C.textSecondary, fontSize: 10, marginTop: 1 },
  resultPrice: { color: C.action, fontSize: 12, fontWeight: '700' },
  selectedCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.card,
    borderRadius: 12, padding: 10, marginBottom: 16, borderWidth: 1, borderColor: C.action,
  },
  selectedThumb: { width: 50, height: 70, borderRadius: 8, backgroundColor: C.elevated, marginRight: 12 },
  selectedName: { color: C.text, fontSize: 14, fontWeight: '700' },
  selectedSet: { color: C.textSecondary, fontSize: 11, marginTop: 2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  qtyBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: C.card,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border,
  },
  qtyInput: {
    backgroundColor: C.card, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8,
    color: C.text, fontSize: 16, fontWeight: '700', width: 60,
    borderWidth: 1, borderColor: C.border,
  },
  totalText: { color: C.action, fontSize: 13, fontWeight: '600', textAlign: 'center', marginBottom: 12 },
}))


export default PortfolioScreen;