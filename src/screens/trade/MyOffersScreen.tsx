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

type NavProp = NativeStackNavigationProp<any>;
const { width } = Dimensions.get('window');

const STATUS_CONFIG: Record<OfferStatus, { label: string; color: string; bg: string }> = {
  pending:   { label: '⏳ 待回覆',   color: '#FFB800', bg: '#2A1F00' },
  accepted:  { label: '✅ 已接受',    color: '#00C864', bg: '#002A12' },
  rejected:  { label: '❌ 已拒絕',    color: '#FF3C3C', bg: '#2A0000' },
  cancelled: { label: '🚫 已取消',   color: '#8888AA', bg: '#1A1A2E' },
  countered: { label: '💬 還價',    color: '#00B4FF', bg: '#001A2A' },
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
            <Text style={{ fontSize: 20, opacity: 0.3 }}>🎴</Text>
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
            <Text key={i} style={styles.offerCardChip}>🎴</Text>
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
              <Text style={styles.quickBtnAcceptText}>✅ 接受</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickBtn, styles.quickBtnReject]}
              onPress={() => onQuickAction('reject')}
            >
              <Text style={styles.quickBtnRejectText}>❌</Text>
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
      Alert.alert(
        '❌ 拒絕 Offer',
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
      Alert.alert(
        data.newStatus === 'accepted' ? '✅ 成交！' : '✅ 已回覆',
        data.newStatus === 'accepted' ? '卡片已交換，查看記錄吧！' : 'Offer 已更新'
      );
      loadOffers();
    } catch (err: any) {
      Alert.alert('操作失敗', err.message || '請稍後重試');
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
        <Text style={styles.headerTitle}>💬 我的 Offer</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'received' ? styles.tabActive]}
          onPress={() => setActiveTab('received')}
        >
          <Text style={[styles.tabText, activeTab === 'received' ? styles.tabTextActive]}>
            📥 收到的
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'sent' ? styles.tabActive]}
          onPress={() => setActiveTab('sent')}
        >
          <Text style={[styles.tabText, activeTab === 'sent' ? styles.tabTextActive]}>
            📤 發出的
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#FF3C3C" />
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
              tintColor="#FF3C3C"
            />
          }
        />
      )}
    </View>
  );
};

// ─── Styles ────────────────────────────────────────────────────────────────────

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
  tabBar: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1E1E2E',
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#FF3C3C' },
  tabText: { color: '#8888AA', fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: '#FFFFFF' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingBottom: 100 },
  emptyContainer: { flex: 1 },

  // Offer Row
  offerRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1E1E2E', marginHorizontal: 16, marginTop: 12,
    borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: '#2A2A3E',
  },
  targetCardWrap: { marginRight: 12 },
  targetCardThumb: {
    width: 56, height: 72, backgroundColor: '#16213E', borderRadius: 10,
  },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  offerInfo: { flex: 1 },
  offerTargetName: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', marginBottom: 2 },
  offerMeta: { color: '#8888AA', fontSize: 11, marginBottom: 4 },
  offerCardsPreview: { flexDirection: 'row', alignItems: 'center', marginBottom: 2, gap: 3 },
  offerCardChip: { fontSize: 14 },
  offerCardMore: { color: '#8888AA', fontSize: 10 },
  cashChip: {
    backgroundColor: '#2A1F00', color: '#FFB800', fontSize: 10,
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6,
  },
  offerValue: { color: '#6666AA', fontSize: 10 },
  offerRight: { alignItems: 'flex-end', gap: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
  quickActions: { flexDirection: 'row', gap: 6 },
  quickBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  quickBtnAccept: { backgroundColor: '#002A12' },
  quickBtnAcceptText: { color: '#00C864', fontSize: 11, fontWeight: '700' },
  quickBtnReject: { backgroundColor: '#2A0000' },
  quickBtnRejectText: { color: '#FF3C3C', fontSize: 11 },

  // Empty
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIcon: { fontSize: 60, opacity: 0.3 },
  emptyTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginTop: 16, textAlign: 'center' },
  emptySub: { color: '#6666AA', fontSize: 13, marginTop: 8, textAlign: 'center' },
});

export default MyOffersScreen;
