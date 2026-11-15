/**
 * PokeMarket — MyOffersScreen
 * 我的 Offer 列表頁（發出 / 收到）
 *
 * 功能：
 * - Tab: "我發出的" / "我收到的"
 * - Offer 列表，含狀態 badge
 * - 收到的 Offer 可即時 accept/reject
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, Image, Alert, Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Offer, OfferStatus } from '../../types/trade';
import { confirmAction, notify } from '../../components/Feedback';
import { C } from '../../theme';
import Ionicons from '@expo/vector-icons/Ionicons';

type NavProp = NativeStackNavigationProp<any>;
const { width } = Dimensions.get('window');

const STATUS_CONFIG: Record<OfferStatus, { label: string; color: string; bg: string }> = {
  pending:   { label: '待回覆',   color: C.gold, bg: '#2A1F00' },
  accepted:  { label: '已接受',    color: C.up, bg: '#002A12' },
  rejected:  { label: '已拒絕',    color: C.action, bg: '#2A0000' },
  cancelled: { label: '🚫 已取消',   color: C.textSecondary, bg: '#1A1A2E' },
  countered: { label: '還價',    color: C.info, bg: '#001A2A' },
};

// ─── Single Offer Row ──────────────────────────────────────────────────────────

const OfferRow: React.FC<{
  offer: Offer;
  role: 'buyer' | 'seller';
  onPress: () => void;
  onQuickAction?: (action: 'accept' | 'reject') => void;
}> = ({ offer, role, onPress, onQuickAction }) => {
  const cfg = STATUS_CONFIG[offer.status] || STATUS_CONFIG.pending;
  const isSeller = role === 'seller';

  const totalOfferValue = (offer.offerCards || []).reduce(
    (s, oc) => s + (oc.card?.marketPrice || 0), 0
  ) + (offer.cashAddHkd || 0);

  return (
    <TouchableOpacity style={styles.offerRow} onPress={onPress} activeOpacity={0.75}>
      {/* Left: target card */}
      <View style={styles.targetCardWrap}>
        {offer.targetCard?.imageUrl ? (
          <Image
            source={{ uri: offer.targetCard.imageUrl }}
            style={styles.targetCardThumb}
            resizeMode="contain"
          />
        ) : (
          <View style={[styles.targetCardThumb, styles.thumbPlaceholder]}>
            <Ionicons name="card-outline" size={20} color={C.textTertiary} />
          </View>
        )}
      </View>

      {/* Center: info */}
      <View style={styles.offerInfo}>
        <Text style={styles.offerTargetName} numberOfLines={1}>
          {offer.targetCard?.name || '未知卡片'}
        </Text>
        <Text style={styles.offerMeta}>
          {isSeller ? `← ${offer.buyerName} 的 Offer` : `→ ${offer.targetCard?.name}`}
        </Text>
        <View style={styles.offerCardsPreview}>
          {(offer.offerCards || []).slice(0, 3).map((oc, i) => (
            <Ionicons name="card-outline" size={22} color={C.textTertiary} />
          ))}
          {(offer.offerCards || []).length > 3 && (
            <Text style={styles.offerCardMore}>
              +{(offer.offerCards || []).length - 3}
            </Text>
          )}
          {offer.cashAddHkd > 0 && (
            <Text style={styles.cashChip}>+HK${offer.cashAddHkd}</Text>
          )}
        </View>
        <Text style={styles.offerValue}>
          Offer 總值：HK${totalOfferValue.toLocaleString()}
        </Text>
      </View>

      {/* Right: status + actions */}
      <View style={styles.offerRight}>
        <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
          <Text style={[styles.statusBadgeText, { color: cfg.color }]}>
            {cfg.label}
          </Text>
        </View>

        {/* Quick actions for received pending offers */}
        {isSeller && offer.status === 'pending' && onQuickAction && (
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={[styles.quickBtn, styles.quickBtnAccept]}
              onPress={() => onQuickAction('accept')}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="checkmark-circle" size={14} color={C.textTertiary} /><Text style={styles.quickBtnAcceptText}>接受</Text></View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickBtn, styles.quickBtnReject]}
              onPress={() => onQuickAction('reject')}
            >
              <Ionicons name="close-circle" size={14} color={C.textTertiary} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

// ─── Main Screen ────────────────────────────────────────────────────────────────

type TabType = 'sent' | 'received';

const MyOffersScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const [activeTab, setActiveTab] = useState<TabType>('received');
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadOffers = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const fns = getFunctions();
      const getOffers = httpsCallable(fns, 'getMyOffers', { timeout: 20000 });
      const result = await getOffers({
        type: activeTab === 'sent' ? 'sent' : 'received',
      });
      const data = result.data as { offers: Offer[]; total: number };
      setOffers(data.offers || []);
    } catch (err) {
      console.error('loadOffers error:', err);
      setOffers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab]);

  useEffect(() => { loadOffers(); }, [loadOffers]);

  const handleQuickAction = async (offer: Offer, action: 'accept' | 'reject') => {
    if (action === 'reject') {
      confirmAction(
        '拒絕 Offer',
        `確定要拒絕 ${offer.buyerName} 的這個 Offer 嗎？`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '確認拒絕',
            style: 'destructive',
            onPress: () => executeAction(offer.id, 'reject'),
          },
        ]
      );
      return;
    }
    await executeAction(offer.id, 'accept');
  };

  const executeAction = async (offerId: string, action: 'accept' | 'reject' | 'counter') => {
    setActionLoading(offerId);
    try {
      const fns = getFunctions();
      const respond = httpsCallable(fns, 'respondToOffer', { timeout: 30000 });
      const result = await respond({ offerId, action });
      const data = result.data as { offerId: string; newStatus: OfferStatus; tradeId?: string };
      notify(
        data.newStatus === 'accepted' ? '成交！' : '已回覆',
        data.newStatus === 'accepted' ? '卡片已交換，查看記錄吧！' : 'Offer 已更新'
      );
      loadOffers();
    } catch (err: any) {
      notify('操作失敗', err.message || '請稍後重試');
    } finally {
      setActionLoading(null);
    }
  };

  const renderItem = ({ item }: { item: Offer }) => (
    <OfferRow
      offer={item}
      role={activeTab === 'received' ? 'seller' : 'buyer'}
      onPress={() => navigation.navigate('OfferDetail', { offer: item, role: activeTab })}
      onQuickAction={(action) => handleQuickAction(item, action)}
    />
  );

  const ListEmpty = () => (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyIcon}>
        {activeTab === 'sent' ? '📨' : '📥'}
      </Text>
      <Text style={styles.emptyTitle}>
        {activeTab === 'sent' ? '你還沒有發出過 Offer' : '你還沒有收到過 Offer'}
      </Text>
      <Text style={styles.emptySub}>
        {activeTab === 'sent'
          ? '去市場逛逛，發個 Offer 試試！'
          : '在其他地方放卡，就會有人向你發 Offer 了'}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← 返回</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="chatbubble-ellipses-outline" size={15} color={C.textTertiary} /><Text style={styles.headerTitle}>我的 Offer</Text></View>
        <View style={{ width: 60 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'received' ? styles.tabActive : null]}
          onPress={() => setActiveTab('received')}
        >
          <Text style={[styles.tabText, activeTab === 'received' ? styles.tabTextActive : null]}>
            📥 收到的
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'sent' ? styles.tabActive : null]}
          onPress={() => setActiveTab('sent')}
        >
          <Text style={[styles.tabText, activeTab === 'sent' ? styles.tabTextActive : null]}>
            📤 發出的
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={C.action} />
        </View>
      ) : (
        <FlatList
          data={offers}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          ListEmptyComponent={ListEmpty}
          contentContainerStyle={offers.length === 0 ? styles.emptyContainer : styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadOffers(); }}
              tintColor={C.action}
            />
          }
        />
      )}
    </View>
  );
};

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: C.elevated,
  },
  backBtn: { width: 60 },
  backBtnText: { color: C.action, fontSize: 15, fontWeight: '600' },
  headerTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
  tabBar: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.elevated,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: C.action },
  tabText: { color: C.textSecondary, fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: C.text },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingBottom: 100 },
  emptyContainer: { flex: 1 },

  // Offer Row
  offerRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.elevated, marginHorizontal: 16, marginTop: 12,
    borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: C.border,
  },
  targetCardWrap: { marginRight: 12 },
  targetCardThumb: {
    width: 56, height: 72, backgroundColor: '#16213E', borderRadius: 10,
  },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  offerInfo: { flex: 1 },
  offerTargetName: { color: C.text, fontSize: 13, fontWeight: '700', marginBottom: 2 },
  offerMeta: { color: C.textSecondary, fontSize: 11, marginBottom: 4 },
  offerCardsPreview: { flexDirection: 'row', alignItems: 'center', marginBottom: 2, gap: 3 },
  offerCardChip: { fontSize: 14 },
  offerCardMore: { color: C.textSecondary, fontSize: 10 },
  cashChip: {
    backgroundColor: '#2A1F00', color: C.gold, fontSize: 10,
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6,
  },
  offerValue: { color: C.textTertiary, fontSize: 10 },
  offerRight: { alignItems: 'flex-end', gap: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
  quickActions: { flexDirection: 'row', gap: 6 },
  quickBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  quickBtnAccept: { backgroundColor: '#002A12' },
  quickBtnAcceptText: { color: C.up, fontSize: 11, fontWeight: '700' },
  quickBtnReject: { backgroundColor: '#2A0000' },
  quickBtnRejectText: { color: C.action, fontSize: 11 },

  // Empty
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIcon: { fontSize: 60, opacity: 0.3 },
  emptyTitle: { color: C.text, fontSize: 16, fontWeight: '700', marginTop: 16, textAlign: 'center' },
  emptySub: { color: C.textTertiary, fontSize: 13, marginTop: 8, textAlign: 'center' },
});

export default MyOffersScreen;
