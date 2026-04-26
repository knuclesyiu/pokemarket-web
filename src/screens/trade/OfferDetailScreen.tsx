/**
 * PokeMarket — OfferDetailScreen
 * Offer 詳情頁
 *
 * 功能：
 * - 顯示完整 Offer 詳情（目標卡、雙方卡片、金額、狀態）
 * - Action buttons（取決於角色和狀態）
 * - 接受 / 拒絕 / 還價 / 取消
 */

import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Image,
  TouchableOpacity, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Offer, OfferCard, OfferStatus, TradeCard } from '../../types/trade';

type NavProp = NativeStackNavigationProp<any>;

// ─── Card Display ───────────────────────────────────────────────────────────────

const OfferCardItem: React.FC<{ oc: OfferCard; label?: string }> = ({ oc, label }) => (
  <View style={styles.offerCardItem}>
    {oc.card?.imageUrl ? (
      <Image source={{ uri: oc.card.imageUrl }} style={styles.offerCardImg} resizeMode="contain" />
    ) : (
      <View style={[styles.offerCardImg, styles.offerCardImgPlaceholder]}>
        <Text style={{ fontSize: 28, opacity: 0.3 }}>🎴</Text>
      </View>
    )}
    <View style={styles.offerCardInfo}>
      <Text style={styles.offerCardName} numberOfLines={1}>{oc.card?.name || '未知卡片'}</Text>
      <Text style={styles.offerCardSet} numberOfLines={1}>{oc.card?.set}</Text>
      <View style={styles.offerCardMeta}>
        <Text style={styles.offerCardRarity}>{oc.card?.rarity}</Text>
        <Text style={styles.offerCardCondition}>{oc.condition}</Text>
        {oc.grade && <Text style={styles.offerCardGrade}>PSA {oc.grade}</Text>}
      </View>
      {label && <Text style={styles.offerCardLabel}>{label}</Text>}
    </View>
  </View>
);

// ─── Counter Offer Section ───────────────────────────────────────────────────────

const CounterOfferSection: React.FC<{
  counterOffer: NonNullable<Offer['counterOffer']>;
  onAccept: () => void;
  onReject: () => void;
}> = ({ counterOffer, onAccept, onReject }) => (
  <View style={styles.counterSection}>
    <Text style={styles.counterTitle}>💬 對方還價</Text>
    {counterOffer.counterCards?.length > 0 && (
      <View>
        <Text style={styles.counterSectionLabel}>還價卡片：</Text>
        {counterOffer.counterCards.map((oc, i) => (
          <OfferCardItem key={i} oc={oc} />
        ))}
      </View>
    )}
    {counterOffer.counterCashHkd > 0 && (
      <Text style={styles.counterCashText}>
        + 現金補貼：HK${counterOffer.counterCashHkd.toLocaleString()}
      </Text>
    )}
    {counterOffer.counterMessage && (
      <Text style={styles.counterMessageText}>「{counterOffer.counterMessage}」</Text>
    )}
    <View style={styles.counterActions}>
      <TouchableOpacity style={styles.acceptBtn} onPress={onAccept}>
        <Text style={styles.acceptBtnText}>✅ 接受還價</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.rejectBtn} onPress={onReject}>
        <Text style={styles.rejectBtnText}>❌ 拒絕</Text>
      </TouchableOpacity>
    </View>
  </View>
);

// ─── Main Screen ────────────────────────────────────────────────────────────────

const OfferDetailScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<any>();
  const { offer, role } = route.params as { offer: Offer; role: 'buyer' | 'seller' };
  const isSeller = role === 'seller';

  const [actionLoading, setActionLoading] = useState(false);
  const [showCounterForm, setShowCounterForm] = useState(false);
  const [counterCards, setCounterCards] = useState<OfferCard[]>([]);
  const [counterCash, setCounterCash] = useState(0);
  const [counterMessage, setCounterMessage] = useState('');

  const STATUS_CONFIG: Record<OfferStatus, { label: string; color: string; bg: string }> = {
    pending:   { label: '⏳ 待回覆',   color: '#FFB800', bg: '#2A1F00' },
    accepted:  { label: '✅ 已接受',    color: '#00C864', bg: '#002A12' },
    rejected:  { label: '❌ 已拒絕',    color: '#FF3C3C', bg: '#2A0000' },
    cancelled: { label: '🚫 已取消',   color: '#8888AA', bg: '#1A1A2E' },
    countered: { label: '💬 待接受還價', color: '#00B4FF', bg: '#001A2A' },
  };
  const cfg = STATUS_CONFIG[offer.status] || STATUS_CONFIG.pending;

  const totalOfferValue = (offer.offerCards || []).reduce(
    (s, oc) => s + (oc.card?.marketPrice || 0), 0
  ) + (offer.cashAddHkd || 0);

  const executeAction = async (action: 'accept' | 'reject' | 'counter' | 'cancel') => {
    setActionLoading(true);
    try {
      const fns = getFunctions();
      const respond = httpsCallable(fns, action === 'cancel' ? 'cancelOffer' : 'respondToOffer', {
        timeout: 30000,
      });
      const payload: Record<string, any> =
        action === 'cancel'
          ? { offerId: offer.id }
          : action === 'counter'
          ? {
              offerId: offer.id,
              action: 'counter',
              counterData: {
                counterCards: counterCards,
                counterCashHkd: counterCash,
                counterMessage,
              },
            }
          : { offerId: offer.id, action };

      const result = await respond(payload);
      const data = result.data as { offerId: string; newStatus: OfferStatus; tradeId?: string };

      if (action === 'cancel') {
        Alert.alert('已取消', '你的 Offer 已被取消');
        navigation.goBack();
      } else if (data.newStatus === 'accepted') {
        Alert.alert('✅ 成交完成！', '卡片已成功交換，請在收藏頁確認！', [
          { text: '查看收藏', onPress: () => navigation.navigate('PortfolioTab') },
          { text: '返回', onPress: () => navigation.goBack() },
        ]);
      } else if (data.newStatus === 'countered') {
        Alert.alert('💬 還價已發出', '等待對方回覆');
        navigation.goBack();
      } else {
        Alert.alert('✅ 已處理', `Offer 狀態：${data.newStatus}`);
        navigation.goBack();
      }
    } catch (err: any) {
      Alert.alert('操作失敗', err.message || '請稍後重試');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAccept = () => {
    Alert.alert('✅ 確認接受 Offer', '即將進行卡片交換，雙方收藏將同步更新', [
      { text: '取消', style: 'cancel' },
      { text: '確認接受', onPress: () => executeAction('accept') },
    ]);
  };

  const handleReject = () => {
    Alert.alert('❌ 確認拒絕', `確定要拒絕這個 Offer 嗎？`, [
      { text: '取消', style: 'cancel' },
      { text: '確認拒絕', style: 'destructive', onPress: () => executeAction('reject') },
    ]);
  };

  const handleCancel = () => {
    Alert.alert('🚫 取消 Offer', '確定要撤回你的 Offer 嗎？', [
      { text: '否', style: 'cancel' },
      { text: '是，取消 Offer', style: 'destructive', onPress: () => executeAction('cancel') },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Offer 詳情</Text>
        <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
          <Text style={[styles.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Target Card ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            🎯 目標卡片 {isSeller ? '(你的掛牌)' : '(賣家的卡)'}
          </Text>
          <View style={styles.targetCard}>
            {offer.targetCard?.imageUrl ? (
              <Image
                source={{ uri: offer.targetCard.imageUrl }}
                style={styles.targetCardImg}
                resizeMode="contain"
              />
            ) : (
              <View style={[styles.targetCardImg, styles.targetCardImgPlaceholder]}>
                <Text style={{ fontSize: 50, opacity: 0.3 }}>🎴</Text>
              </View>
            )}
            <View style={styles.targetCardInfo}>
              <Text style={styles.targetCardName}>{offer.targetCard?.name}</Text>
              <Text style={styles.targetCardSet}>{offer.targetCard?.set}</Text>
              <Text style={styles.targetCardPrice}>HK${offer.targetPrice?.toLocaleString()}</Text>
            </View>
          </View>
        </View>

        {/* ── Offer Summary ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {isSeller ? `📤 ${offer.buyerName} 的 Offer` : '📤 你的 Offer'}
            </Text>
            <Text style={styles.offerTotalValue}>
              約 HK${totalOfferValue.toLocaleString()}
            </Text>
          </View>

          {/* Offer Cards */}
          {(offer.offerCards || []).length > 0 ? (
            <View style={styles.cardsGrid}>
              {(offer.offerCards || []).map((oc, i) => (
                <OfferCardItem key={i} oc={oc} label={isSeller ? `來自 ${offer.buyerName}` : '你的卡'} />
              ))}
            </View>
          ) : (
            <Text style={styles.noCardsText}>無卡片，只有現金</Text>
          )}

          {/* Cash */}
          {offer.cashAddHkd > 0 && (
            <View style={styles.cashRow}>
              <Text style={styles.cashLabel}>💵 現金補貼</Text>
              <Text style={styles.cashValue}>HK${offer.cashAddHkd.toLocaleString()}</Text>
            </View>
          )}

          {/* Message */}
          {offer.message && (
            <View style={styles.messageRow}>
              <Text style={styles.messageLabel}>💬 留言</Text>
              <Text style={styles.messageText}>「{offer.message}」</Text>
            </View>
          )}
        </View>

        {/* ── Counter Offer (if exists) ── */}
        {offer.counterOffer && (
          <CounterOfferSection
            counterOffer={offer.counterOffer}
            onAccept={() => executeAction('accept')}
            onReject={() => executeAction('reject')}
          />
        )}

        {/* ── Counter Form (seller counter action) ── */}
        {isSeller && offer.status === 'pending' && !showCounterForm && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.counterTrigger}
              onPress={() => setShowCounterForm(true)}
            >
              <Text style={styles.counterTriggerText}>💬 提出還價</Text>
            </TouchableOpacity>
          </View>
        )}

        {showCounterForm && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>💬 你的還價（可選）</Text>
            <Text style={styles.counterHint}>
              你可以提供不同的卡片或現金作為反提案
            </Text>
            <TextInput
              style={styles.counterMessageInput}
              placeholder="還價留言..."
              placeholderTextColor="#6666AA"
              multiline
              value={counterMessage}
              onChangeText={setCounterMessage}
            />
            <TextInput
              style={styles.counterCashInput}
              placeholder="現金補貼金額（HKD）"
              placeholderTextColor="#6666AA"
              keyboardType="numeric"
              value={counterCash > 0 ? String(counterCash) : ''}
              onChangeText={v => setCounterCash(Number(v.replace(/[^0-9]/g, '')))}
            />
          </View>
        )}

        <View style={{ height: 140 }} />
      </ScrollView>

      {/* ── Action Bar ── */}
      {offer.status === 'pending' || offer.status === 'countered' ? (
        <View style={styles.actionBar}>
          {isSeller ? (
            // Seller actions
            <>
              <TouchableOpacity
                style={[styles.actionBtn, styles.acceptActionBtn]}
                disabled={actionLoading}
                onPress={handleAccept}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.actionBtnText}>✅ 接受</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.counterActionBtn]}
                disabled={actionLoading}
                onPress={() => {
                  if (showCounterForm) executeAction('counter');
                  else setShowCounterForm(true);
                }}
              >
                <Text style={styles.counterActionBtnText}>
                  {showCounterForm ? '發出還價 💬' : '💬 還價'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.rejectActionBtn]}
                disabled={actionLoading}
                onPress={handleReject}
              >
                <Text style={styles.rejectActionBtnText}>❌ 拒絕</Text>
              </TouchableOpacity>
            </>
          ) : (
            // Buyer actions
            <TouchableOpacity
              style={[styles.actionBtn, styles.cancelActionBtn]}
              disabled={actionLoading}
              onPress={handleCancel}
            >
              {actionLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.cancelActionBtnText}>🚫 取消 Offer</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      ) : null}
    </View>
  );
};

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#12121F' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#1E1E2E',
  },
  backBtn: { width: 60 },
  backBtnText: { color: '#FF3C3C', fontSize: 15, fontWeight: '600' },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  scroll: { flex: 1 },
  section: { paddingHorizontal: 16, paddingTop: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginBottom: 12 },

  // Target Card
  targetCard: {
    backgroundColor: '#1E1E2E', borderRadius: 16, overflow: 'hidden',
    borderWidth: 2, borderColor: '#FF3C3C',
  },
  targetCardImg: { width: '100%', height: 200, backgroundColor: '#16213E' },
  targetCardImgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  targetCardInfo: { padding: 16 },
  targetCardName: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  targetCardSet: { color: '#8888AA', fontSize: 13, marginTop: 2 },
  targetCardPrice: { color: '#FF3C3C', fontSize: 22, fontWeight: '800', marginTop: 6 },

  // Offer Cards
  offerTotalValue: { color: '#FF3C3C', fontSize: 12, fontWeight: '600' },
  cardsGrid: { gap: 10 },
  offerCardItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1E1E2E', borderRadius: 12, padding: 10,
    borderWidth: 1, borderColor: '#2A2A3E',
  },
  offerCardImg: { width: 56, height: 72, backgroundColor: '#16213E', borderRadius: 10 },
  offerCardImgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  offerCardInfo: { flex: 1, marginLeft: 12 },
  offerCardName: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  offerCardSet: { color: '#8888AA', fontSize: 11, marginTop: 1 },
  offerCardMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 },
  offerCardRarity: { color: '#FFB800', fontSize: 10 },
  offerCardCondition: { color: '#8888AA', fontSize: 10 },
  offerCardGrade: { color: '#00B4FF', fontSize: 10 },
  offerCardLabel: { color: '#6666AA', fontSize: 10, marginTop: 2 },
  noCardsText: { color: '#6666AA', fontSize: 13, fontStyle: 'italic' },

  // Cash / Message
  cashRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#1E1E2E', borderRadius: 12, padding: 12, marginTop: 10,
    borderWidth: 1, borderColor: '#2A1F00',
  },
  cashLabel: { color: '#FFB800', fontSize: 13, fontWeight: '600' },
  cashValue: { color: '#FFB800', fontSize: 16, fontWeight: '800' },
  messageRow: {
    backgroundColor: '#1E1E2E', borderRadius: 12, padding: 12, marginTop: 10,
    borderWidth: 1, borderColor: '#2A2A3E',
  },
  messageLabel: { color: '#8888AA', fontSize: 11, marginBottom: 6 },
  messageText: { color: '#FFFFFF', fontSize: 13, fontStyle: 'italic', lineHeight: 20 },

  // Counter Section
  counterSection: {
    backgroundColor: '#001A2A', borderRadius: 14, padding: 16,
    marginHorizontal: 16, marginTop: 16, borderWidth: 1, borderColor: '#00B4FF40',
  },
  counterTitle: { color: '#00B4FF', fontSize: 15, fontWeight: '700', marginBottom: 12 },
  counterSectionLabel: { color: '#8888AA', fontSize: 12, marginBottom: 8 },
  counterCashText: { color: '#FFB800', fontSize: 14, fontWeight: '700', marginTop: 8 },
  counterMessageText: { color: '#8888AA', fontSize: 13, fontStyle: 'italic', marginTop: 8 },
  counterActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  acceptBtn: { flex: 1, backgroundColor: '#002A12', borderRadius: 10, padding: 12, alignItems: 'center' },
  acceptBtnText: { color: '#00C864', fontSize: 14, fontWeight: '700' },
  rejectBtn: { flex: 1, backgroundColor: '#2A0000', borderRadius: 10, padding: 12, alignItems: 'center' },
  rejectBtnText: { color: '#FF3C3C', fontSize: 14, fontWeight: '700' },

  // Counter Form
  counterTrigger: {
    backgroundColor: '#001A2A', borderRadius: 12, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: '#00B4FF40',
  },
  counterTriggerText: { color: '#00B4FF', fontSize: 14, fontWeight: '600' },
  counterHint: { color: '#6666AA', fontSize: 12, marginBottom: 12 },
  counterMessageInput: {
    backgroundColor: '#1E1E2E', borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, color: '#FFFFFF', fontSize: 14, minHeight: 70,
    textAlignVertical: 'top', borderWidth: 1, borderColor: '#2A2A3E', marginBottom: 10,
  },
  counterCashInput: {
    backgroundColor: '#1E1E2E', borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, color: '#FFFFFF', fontSize: 14,
    borderWidth: 1, borderColor: '#2A2A3E',
  },

  // Action Bar
  actionBar: {
    flexDirection: 'row', gap: 10,
    backgroundColor: '#12121F', borderTopWidth: 1, borderTopColor: '#1E1E2E',
    paddingHorizontal: 16, paddingVertical: 14, paddingBottom: 30,
  },
  actionBtn: {
    flex: 1, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center', minHeight: 50,
  },
  actionBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  acceptActionBtn: { backgroundColor: '#00C864' },
  counterActionBtn: { backgroundColor: '#001A2A', borderWidth: 1, borderColor: '#00B4FF' },
  counterActionBtnText: { color: '#00B4FF', fontSize: 14, fontWeight: '700' },
  rejectActionBtn: { backgroundColor: '#2A0000', flex: 0.6 },
  rejectActionBtnText: { color: '#FF3C3C', fontSize: 14, fontWeight: '700' },
  cancelActionBtn: { backgroundColor: '#2A0000' },
  cancelActionBtnText: { color: '#FF3C3C', fontSize: 14, fontWeight: '700' },
});

export default OfferDetailScreen;
