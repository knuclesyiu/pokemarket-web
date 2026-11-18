/**
 * PokeMarket — OfferDetailScreen
 * Offer 詳情頁
 *
 * 功能：
 * - 顯示完整 Offer 詳情（目標卡、雙方卡片、金額、狀態）
 * - Action buttons（取決於角色和狀態）
 * - 接受 / 拒絕 / 還價 / 取消
 */

import { t } from '../../i18n';
import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Image,
  TouchableOpacity, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Offer, OfferCard, OfferStatus, TradeCard } from '../../types/trade';
import { confirmAction, notify } from '../../components/Feedback';
import { C, themed } from '../../theme';
import Ionicons from '@expo/vector-icons/Ionicons';

type NavProp = NativeStackNavigationProp<any>;

// ─── Card Display ───────────────────────────────────────────────────────────────

const OfferCardItem: React.FC<{ oc: OfferCard; label?: string }> = ({ oc, label }) => (
  <View style={styles.offerCardItem}>
    {oc.card?.imageUrl ? (
      <Image source={{ uri: oc.card.imageUrl }} style={styles.offerCardImg} resizeMode="contain" />
    ) : (
      <View style={[styles.offerCardImg, styles.offerCardImgPlaceholder]}>
        <Ionicons name="card-outline" size={28} color={C.textTertiary} />
      </View>
    )}
    <View style={styles.offerCardInfo}>
      <Text style={styles.offerCardName} numberOfLines={1}>{oc.card?.name || t('未知卡片')}</Text>
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
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="chatbubble-ellipses-outline" size={15} color={C.textTertiary} /><Text style={styles.counterTitle}>{t(t('對方還價'))}</Text></View>
    {counterOffer.counterCards?.length > 0 && (
      <View>
        <Text style={styles.counterSectionLabel}>{t(t('還價卡片：'))}</Text>
        {counterOffer.counterCards.map((oc, i) => (
          <OfferCardItem key={i} oc={oc} />
        ))}
      </View>
    )}
    {counterOffer.counterCashHkd > 0 && (
      <Text style={styles.counterCashText}>
        {t('+ 現金補貼：HK${p0}', { p0: counterOffer.counterCashHkd.toLocaleString() })}
      </Text>
    )}
    {counterOffer.counterMessage && (
      <Text style={styles.counterMessageText}>「{counterOffer.counterMessage}」</Text>
    )}
    <View style={styles.counterActions}>
      <TouchableOpacity style={styles.acceptBtn} onPress={onAccept}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="checkmark-circle" size={14} color={C.textTertiary} /><Text style={styles.acceptBtnText}>{t(t('接受還價'))}</Text></View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.rejectBtn} onPress={onReject}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="close-circle" size={14} color={C.textTertiary} /><Text style={styles.rejectBtnText}>{t(t('拒絕'))}</Text></View>
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
    pending:   { label: t('待回覆'),   color: C.gold, bg: '#2A1F00' },
    accepted:  { label: t('已接受'),    color: C.up, bg: '#002A12' },
    rejected:  { label: t('已拒絕'),    color: C.action, bg: '#2A0000' },
    cancelled: { label: t('🚫 已取消'),   color: C.textSecondary, bg: '#1A1A2E' },
    countered: { label: t('待接受還價'), color: C.info, bg: '#001A2A' },
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
        notify(t('已取消'), t('你的 Offer 已被取消'));
        navigation.goBack();
      } else if (data.newStatus === 'accepted') {
        confirmAction(t('成交完成！'), t('卡片已成功交換，請在收藏頁確認！'), [
          { text: t('查看收藏'), onPress: () => navigation.navigate('Main', { screen: 'PortfolioTab' }) },
          { text: t('返回'), onPress: () => navigation.goBack() },
        ]);
      } else if (data.newStatus === 'countered') {
        notify(t('還價已發出'), t('等待對方回覆'));
        navigation.goBack();
      } else {
        notify(t('已處理'), `Offer 狀態：${data.newStatus}`);
        navigation.goBack();
      }
    } catch (err: any) {
      notify(t('操作失敗'), err.message || t('請稍後重試'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleAccept = () => {
    confirmAction(t('確認接受 Offer'), t('即將進行卡片交換，雙方收藏將同步更新'), [
      { text: t('取消'), style: 'cancel' },
      { text: t('確認接受'), onPress: () => executeAction('accept') },
    ]);
  };

  const handleReject = () => {
    confirmAction(t('確認拒絕'), t('確定要拒絕這個 Offer 嗎？'), [
      { text: t('取消'), style: 'cancel' },
      { text: t('確認拒絕'), style: 'destructive', onPress: () => executeAction('reject') },
    ]);
  };

  const handleCancel = () => {
    confirmAction(t('🚫 取消 Offer'), t('確定要撤回你的 Offer 嗎？'), [
      { text: t('否'), style: 'cancel' },
      { text: t('是，取消 Offer'), style: 'destructive', onPress: () => executeAction('cancel') },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>{t(t('← 返回'))}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t(t('Offer 詳情'))}</Text>
        <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
          <Text style={[styles.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Target Card ── */}
        <View style={styles.section}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="albums-outline" size={15} color={C.textTertiary} /><Text style={styles.sectionTitle}>目標卡片 {isSeller ? '(你的掛牌)' : t('(賣家的卡)')}
          </Text></View>
          <View style={styles.targetCard}>
            {offer.targetCard?.imageUrl ? (
              <Image
                source={{ uri: offer.targetCard.imageUrl }}
                style={styles.targetCardImg}
                resizeMode="contain"
              />
            ) : (
              <View style={[styles.targetCardImg, styles.targetCardImgPlaceholder]}>
                <Ionicons name="card-outline" size={50} color={C.textTertiary} />
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
              {isSeller ? `📤 ${offer.buyerName} 的 Offer` : t('📤 你的 Offer')}
            </Text>
            <Text style={styles.offerTotalValue}>
              {t('約 HK${p0}', { p0: totalOfferValue.toLocaleString() })}
            </Text>
          </View>

          {/* Offer Cards */}
          {(offer.offerCards || []).length > 0 ? (
            <View style={styles.cardsGrid}>
              {(offer.offerCards || []).map((oc, i) => (
                <OfferCardItem key={i} oc={oc} label={isSeller ? `來自 ${offer.buyerName}` : t('你的卡')} />
              ))}
            </View>
          ) : (
            <Text style={styles.noCardsText}>{t(t('無卡片，只有現金'))}</Text>
          )}

          {/* Cash */}
          {offer.cashAddHkd > 0 && (
            <View style={styles.cashRow}>
              <Text style={styles.cashLabel}>{t(t('💵 現金補貼'))}</Text>
              <Text style={styles.cashValue}>HK${offer.cashAddHkd.toLocaleString()}</Text>
            </View>
          )}

          {/* Message */}
          {offer.message && (
            <View style={styles.messageRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="chatbubble-ellipses-outline" size={15} color={C.textTertiary} /><Text style={styles.messageLabel}>{t(t('留言'))}</Text></View>
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="chatbubble-ellipses-outline" size={15} color={C.textTertiary} /><Text style={styles.counterTriggerText}>{t(t('提出還價'))}</Text></View>
            </TouchableOpacity>
          </View>
        )}

        {showCounterForm && (
          <View style={styles.section}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="chatbubble-ellipses-outline" size={15} color={C.textTertiary} /><Text style={styles.sectionTitle}>{t(t('你的還價（可選）'))}</Text></View>
            <Text style={styles.counterHint}>
              {t('你可以提供不同的卡片或現金作為反提案')}
            </Text>
            <TextInput
              style={styles.counterMessageInput}
              placeholder={t('還價留言...')}
              placeholderTextColor={C.textTertiary}
              multiline
              value={counterMessage}
              onChangeText={setCounterMessage}
            />
            <TextInput
              style={styles.counterCashInput}
              placeholder={t('現金補貼金額（HKD）')}
              placeholderTextColor={C.textTertiary}
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
                  <ActivityIndicator color={C.text} size="small" />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="checkmark-circle" size={14} color={C.textTertiary} /><Text style={styles.actionBtnText}>{t(t('接受'))}</Text></View>
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
                  {showCounterForm ? '發出還價 💬' : t('還價')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.rejectActionBtn]}
                disabled={actionLoading}
                onPress={handleReject}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="close-circle" size={14} color={C.textTertiary} /><Text style={styles.rejectActionBtnText}>{t(t('拒絕'))}</Text></View>
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
                <ActivityIndicator color={C.text} size="small" />
              ) : (
                <Text style={styles.cancelActionBtnText}>{t(t('🚫 取消 Offer'))}</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      ) : null}
    </View>
  );
};

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = themed((C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: C.elevated,
  },
  backBtn: { width: 60 },
  backBtnText: { color: C.action, fontSize: 15, fontWeight: '600' },
  headerTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  scroll: { flex: 1 },
  section: { paddingHorizontal: 16, paddingTop: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 12 },

  // Target Card
  targetCard: {
    backgroundColor: C.elevated, borderRadius: 16, overflow: 'hidden',
    borderWidth: 2, borderColor: C.action,
  },
  targetCardImg: { width: '100%', height: 200, backgroundColor: '#16213E' },
  targetCardImgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  targetCardInfo: { padding: 16 },
  targetCardName: { color: C.text, fontSize: 18, fontWeight: '800' },
  targetCardSet: { color: C.textSecondary, fontSize: 13, marginTop: 2 },
  targetCardPrice: { color: C.action, fontSize: 22, fontWeight: '800', marginTop: 6 },

  // Offer Cards
  offerTotalValue: { color: C.action, fontSize: 12, fontWeight: '600' },
  cardsGrid: { gap: 10 },
  offerCardItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.elevated, borderRadius: 12, padding: 10,
    borderWidth: 1, borderColor: C.border,
  },
  offerCardImg: { width: 56, height: 72, backgroundColor: '#16213E', borderRadius: 10 },
  offerCardImgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  offerCardInfo: { flex: 1, marginLeft: 12 },
  offerCardName: { color: C.text, fontSize: 13, fontWeight: '700' },
  offerCardSet: { color: C.textSecondary, fontSize: 11, marginTop: 1 },
  offerCardMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 },
  offerCardRarity: { color: C.gold, fontSize: 10 },
  offerCardCondition: { color: C.textSecondary, fontSize: 10 },
  offerCardGrade: { color: C.info, fontSize: 10 },
  offerCardLabel: { color: C.textTertiary, fontSize: 10, marginTop: 2 },
  noCardsText: { color: C.textTertiary, fontSize: 13, fontStyle: 'italic' },

  // Cash / Message
  cashRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: C.elevated, borderRadius: 12, padding: 12, marginTop: 10,
    borderWidth: 1, borderColor: '#2A1F00',
  },
  cashLabel: { color: C.gold, fontSize: 13, fontWeight: '600' },
  cashValue: { color: C.gold, fontSize: 16, fontWeight: '800' },
  messageRow: {
    backgroundColor: C.elevated, borderRadius: 12, padding: 12, marginTop: 10,
    borderWidth: 1, borderColor: C.border,
  },
  messageLabel: { color: C.textSecondary, fontSize: 11, marginBottom: 6 },
  messageText: { color: C.text, fontSize: 13, fontStyle: 'italic', lineHeight: 20 },

  // Counter Section
  counterSection: {
    backgroundColor: '#001A2A', borderRadius: 14, padding: 16,
    marginHorizontal: 16, marginTop: 16, borderWidth: 1, borderColor: '#00B4FF40',
  },
  counterTitle: { color: C.info, fontSize: 15, fontWeight: '700', marginBottom: 12 },
  counterSectionLabel: { color: C.textSecondary, fontSize: 12, marginBottom: 8 },
  counterCashText: { color: C.gold, fontSize: 14, fontWeight: '700', marginTop: 8 },
  counterMessageText: { color: C.textSecondary, fontSize: 13, fontStyle: 'italic', marginTop: 8 },
  counterActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  acceptBtn: { flex: 1, backgroundColor: '#002A12', borderRadius: 10, padding: 12, alignItems: 'center' },
  acceptBtnText: { color: C.up, fontSize: 14, fontWeight: '700' },
  rejectBtn: { flex: 1, backgroundColor: '#2A0000', borderRadius: 10, padding: 12, alignItems: 'center' },
  rejectBtnText: { color: C.action, fontSize: 14, fontWeight: '700' },

  // Counter Form
  counterTrigger: {
    backgroundColor: '#001A2A', borderRadius: 12, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: '#00B4FF40',
  },
  counterTriggerText: { color: C.info, fontSize: 14, fontWeight: '600' },
  counterHint: { color: C.textTertiary, fontSize: 12, marginBottom: 12 },
  counterMessageInput: {
    backgroundColor: C.elevated, borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, color: C.text, fontSize: 14, minHeight: 70,
    textAlignVertical: 'top', borderWidth: 1, borderColor: C.border, marginBottom: 10,
  },
  counterCashInput: {
    backgroundColor: C.elevated, borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, color: C.text, fontSize: 14,
    borderWidth: 1, borderColor: C.border,
  },

  // Action Bar
  actionBar: {
    flexDirection: 'row', gap: 10,
    backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.elevated,
    paddingHorizontal: 16, paddingVertical: 14, paddingBottom: 30,
  },
  actionBtn: {
    flex: 1, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center', minHeight: 50,
  },
  actionBtnText: { color: C.text, fontSize: 14, fontWeight: '800' },
  acceptActionBtn: { backgroundColor: C.up },
  counterActionBtn: { backgroundColor: '#001A2A', borderWidth: 1, borderColor: C.info },
  counterActionBtnText: { color: C.info, fontSize: 14, fontWeight: '700' },
  rejectActionBtn: { backgroundColor: '#2A0000', flex: 0.6 },
  rejectActionBtnText: { color: C.action, fontSize: 14, fontWeight: '700' },
  cancelActionBtn: { backgroundColor: '#2A0000' },
  cancelActionBtnText: { color: C.action, fontSize: 14, fontWeight: '700' },
}))

export default OfferDetailScreen;
