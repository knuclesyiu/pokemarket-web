/**
 * PokeMarket — MakeOfferScreen
 * 向他人的掛牌卡發出交換 Offer
 *
 * 功能：
 * - 顯示目標卡（賣家的掛牌卡）
 * - 從自己的收藏中選擇卡片作為 Offer（多選）
 * - 可選現金補貼（HKD）
 * - 留言框
 * - 發送 Offer 按鈕
 */

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Image,
  TouchableOpacity, TextInput, FlatList, Alert,
  ActivityIndicator, Dimensions,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { MarketListing, TradeCard, UserCard, OfferCard } from '../../types/trade';

type NavProp = NativeStackNavigationProp<any>;
const { width } = Dimensions.get('window');

const CASH_QUICK_ADD = [0, 50, 100, 200, 500, 1000];

// ─── Selected Card Tile ─────────────────────────────────────────────────────────

const SelectableCard: React.FC<{
  userCard: UserCard;
  selected: boolean;
  onToggle: () => void;
}> = ({ userCard, selected, onToggle }) => (
  <TouchableOpacity
    style={[styles.selectableCard, selected ? styles.selectableCardActive : null]}
    onPress={onToggle}
    activeOpacity={0.75}
  >
    {userCard.card?.imageUrl ? (
      <Image
        source={{ uri: userCard.card.imageUrl }}
        style={styles.selectableCardImg}
        resizeMode="contain"
      />
    ) : (
      <View style={[styles.selectableCardImg, styles.selectableCardImgPlaceholder]}>
        <Text style={{ fontSize: 30, opacity: 0.3 }}>🎴</Text>
      </View>
    )}
    <View style={styles.selectableCardInfo}>
      <Text style={styles.selectableCardName} numberOfLines={1}>
        {userCard.card?.name || '未知'}
      </Text>
      <Text style={styles.selectableCardSet} numberOfLines={1}>
        {userCard.card?.set}
      </Text>
    </View>
    <View style={[styles.checkbox, selected ? styles.checkboxActive : null]}>
      {selected && <Text style={styles.checkmark}>✓</Text>}
    </View>
  </TouchableOpacity>
);

// ─── Main Screen ────────────────────────────────────────────────────────────────

const MakeOfferScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<any>();
  const listing: MarketListing = route.params?.listing;

  const [myCards, setMyCards] = useState<UserCard[]>([]);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [cashAddHkd, setCashAddHkd] = useState(0);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showCashInput, setShowCashInput] = useState(false);

  useEffect(() => {
    loadMyCards();
  }, []);

  const loadMyCards = async () => {
    setLoading(true);
    try {
      const fns = getFunctions();
      const getCards = httpsCallable(fns, 'getUserCards', { timeout: 20000 });
      const result = await getCards({});
      const data = result.data as { cards: UserCard[]; total: number };
      setMyCards(data.cards || []);
    } catch (err) {
      console.error('loadMyCards error:', err);
      Alert.alert('載入失敗', '無法讀取你的收藏，請稍後重試');
    } finally {
      setLoading(false);
    }
  };

  const toggleCard = (cardId: string) => {
    setSelectedCardIds(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const getSelectedCards = (): OfferCard[] => {
    return myCards
      .filter(c => selectedCardIds.has(c.id))
      .map(c => ({
        card: c.card as TradeCard,
        condition: c.condition || c.card?.condition || 'Excellent',
        grade: c.grade,
        note: c.notes,
      }));
  };

  const selectedValue = getSelectedCards().reduce(
    (sum, oc) => sum + (oc.card?.marketPrice || 0), 0
  );

  const isValid = selectedCardIds.size > 0 || cashAddHkd > 0;

  const handleSubmit = async () => {
    if (!isValid) {
      Alert.alert('無法發送', '請選擇至少一張卡或填寫現金補貼');
      return;
    }
    if (listing.sellerId) {
      // self-check
      try {
        const fns = getFunctions();
        const me = httpsCallable(fns, 'getMyOffers', { timeout: 10000 });
        const r = await me({ type: 'all' });
        // just proceed
      } catch (_) {}
    }

    setSubmitting(true);
    try {
      const fns = getFunctions();
      const createOffer = httpsCallable(fns, 'createOffer', { timeout: 30000 });
      const result = await createOffer({
        listingId: listing.id,
        offerCards: getSelectedCards(),
        cashAddHkd,
        message: message.trim(),
      });
      const data = result.data as { offerId: string; status: string };
      Alert.alert('✅ Offer 已發出！', `你的交換提議已發送給 ${listing.sellerName}`, [
        { text: '查看我的 Offer', onPress: () => navigation.navigate('MyOffers') },
        { text: '返回', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      console.error('createOffer error:', err);
      Alert.alert('發送失敗', err.message || '請稍後重試');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>發出 Offer</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Target Card ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎯 目標卡片</Text>
          <View style={styles.targetCard}>
            {listing.card?.imageUrl ? (
              <Image
                source={{ uri: listing.card.imageUrl }}
                style={styles.targetCardImg}
                resizeMode="contain"
              />
            ) : (
              <View style={[styles.targetCardImg, styles.targetCardImgPlaceholder]}>
                <Text style={{ fontSize: 50, opacity: 0.3 }}>🎴</Text>
              </View>
            )}
            <View style={styles.targetCardInfo}>
              <Text style={styles.targetCardName}>{listing.card?.name}</Text>
              <Text style={styles.targetCardSet}>{listing.card?.set} #{listing.card?.number}</Text>
              <View style={styles.targetCardMeta}>
                <Text style={styles.targetCardPrice}>HK${listing.price.toLocaleString()}</Text>
                <Text style={styles.targetCardCondition}>{listing.condition}</Text>
              </View>
              <Text style={styles.sellerLabel}>📦 賣家：{listing.sellerName}</Text>
            </View>
          </View>
        </View>

        {/* ── Offer Cards ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🃏 選擇你的卡片作為 Offer</Text>
            <Text style={styles.selectedCount}>
              已選 {selectedCardIds.size} 張（約 HK${selectedValue.toLocaleString()}）
            </Text>
          </View>

          {loading ? (
            <ActivityIndicator color="#FF3C3C" style={{ marginTop: 20 }} />
          ) : myCards.length === 0 ? (
            <View style={styles.emptyCards}>
              <Text style={styles.emptyCardsText}>你的收藏是空的</Text>
              <Text style={styles.emptyCardsSub}>先去新增卡片吧！</Text>
            </View>
          ) : (
            <View style={styles.cardsList}>
              {myCards.map(card => (
                <SelectableCard
                  key={card.id}
                  userCard={card}
                  selected={selectedCardIds.has(card.id)}
                  onToggle={() => toggleCard(card.id)}
                />
              ))}
            </View>
          )}
        </View>

        {/* ── Cash Add ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💵 現金補貼（可選）</Text>
          <Text style={styles.cashHint}>
            若你的卡片市值不足目標卡，可補貼現金差額
          </Text>
          <View style={styles.cashQuickRow}>
            {CASH_QUICK_ADD.map(amt => (
              <TouchableOpacity
                key={amt}
                style={[styles.cashChip, cashAddHkd === amt ? styles.cashChipActive : null]}
                onPress={() => setCashAddHkd(amt === cashAddHkd ? 0 : amt)}
              >
                <Text style={[styles.cashChipText, cashAddHkd === amt ? styles.cashChipTextActive]}>
                  {amt === 0 ? '無' : `HK$${amt}`}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.cashChip, showCashInput ? styles.cashChipActive : null]}
              onPress={() => setShowCashInput(v => !v)}
            >
              <Text style={[styles.cashChipText, showCashInput ? styles.cashChipTextActive]}>自訂</Text>
            </TouchableOpacity>
          </View>
          {showCashInput && (
            <TextInput
              style={styles.cashInput}
              placeholder="輸入金額（HKD）"
              placeholderTextColor="#6666AA"
              keyboardType="numeric"
              value={cashAddHkd > 0 && !CASH_QUICK_ADD.includes(cashAddHkd) ? String(cashAddHkd) : ''}
              onChangeText={v => setCashAddHkd(Number(v.replace(/[^0-9]/g, '')))}
            />
          )}
        </View>

        {/* ── Message ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💬 留言（可選）</Text>
          <TextInput
            style={styles.messageInput}
            placeholder="給賣家留個言...（例：熱交，prefer面交）"
            placeholderTextColor="#6666AA"
            multiline
            maxLength={200}
            value={message}
            onChangeText={setMessage}
          />
          <Text style={styles.charCount}>{message.length}/200</Text>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── Submit Button ── */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.submitBtn, !isValid ? styles.submitBtnDisabled : null]}
          disabled={!isValid || submitting}
          onPress={handleSubmit}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitBtnText}>
              發送 Offer 🚀
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ─── Styles ────────────────────────────────────────────────────────────────────

const CARD_H = 88;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#12121F' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#1E1E2E',
  },
  backBtn: { width: 60 },
  backBtnText: { color: '#FF3C3C', fontSize: 15, fontWeight: '600' },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  scroll: { flex: 1 },
  section: { paddingHorizontal: 16, paddingTop: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginBottom: 12 },
  selectedCount: { color: '#FF3C3C', fontSize: 11, fontWeight: '600', marginBottom: 12 },

  // Target Card
  targetCard: {
    backgroundColor: '#1E1E2E', borderRadius: 16, overflow: 'hidden',
    borderWidth: 2, borderColor: '#FF3C3C',
  },
  targetCardImg: {
    width: '100%', height: 180, backgroundColor: '#16213E',
  },
  targetCardImgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  targetCardInfo: { padding: 16 },
  targetCardName: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  targetCardSet: { color: '#8888AA', fontSize: 13, marginTop: 2 },
  targetCardMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  targetCardPrice: { color: '#FF3C3C', fontSize: 20, fontWeight: '800' },
  targetCardCondition: {
    color: '#8888AA', fontSize: 12, marginLeft: 12,
    backgroundColor: '#12121F', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8,
  },
  sellerLabel: { color: '#6666AA', fontSize: 12, marginTop: 8 },

  // Selectable Cards
  cardsList: { gap: 10 },
  selectableCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1E1E2E', borderRadius: 14, padding: 10,
    borderWidth: 1.5, borderColor: '#2A2A3E',
    height: CARD_H,
  },
  selectableCardActive: { borderColor: '#FF3C3C', backgroundColor: '#1E0A0A' },
  selectableCardImg: {
    width: 56, height: CARD_H - 20, backgroundColor: '#16213E', borderRadius: 10,
  },
  selectableCardImgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  selectableCardInfo: { flex: 1, marginLeft: 12 },
  selectableCardName: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  selectableCardSet: { color: '#8888AA', fontSize: 11, marginTop: 2 },
  checkbox: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: '#2A2A3E', alignItems: 'center', justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: '#FF3C3C', borderColor: '#FF3C3C' },
  checkmark: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },

  emptyCards: { alignItems: 'center', paddingVertical: 30 },
  emptyCardsText: { color: '#8888AA', fontSize: 14 },
  emptyCardsSub: { color: '#6666AA', fontSize: 12, marginTop: 4 },

  // Cash
  cashHint: { color: '#6666AA', fontSize: 12, marginBottom: 12 },
  cashQuickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cashChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
    backgroundColor: '#1E1E2E', borderWidth: 1, borderColor: '#2A2A3E',
  },
  cashChipActive: { backgroundColor: '#FF3C3C', borderColor: '#FF3C3C' },
  cashChipText: { color: '#8888AA', fontSize: 13, fontWeight: '600' },
  cashChipTextActive: { color: '#FFFFFF' },
  cashInput: {
    backgroundColor: '#1E1E2E', borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, color: '#FFFFFF', fontSize: 14, marginTop: 10,
    borderWidth: 1, borderColor: '#2A2A3E',
  },

  // Message
  messageInput: {
    backgroundColor: '#1E1E2E', borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, color: '#FFFFFF', fontSize: 14, minHeight: 80,
    textAlignVertical: 'top', borderWidth: 1, borderColor: '#2A2A3E',
  },
  charCount: { color: '#6666AA', fontSize: 10, textAlign: 'right', marginTop: 4 },

  // Bottom Bar
  bottomBar: {
    backgroundColor: '#12121F', borderTopWidth: 1, borderTopColor: '#1E1E2E',
    paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 30,
  },
  submitBtn: {
    backgroundColor: '#FF3C3C', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
});

export default MakeOfferScreen;
