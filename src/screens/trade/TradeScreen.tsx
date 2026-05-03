/**
 * PokeMarket — TradeScreen
 * 卡片交換市場主頁（Swap Tab）
 *
 * 功能：
 * - 市場掛牌卡片網格（可滾動）
 * - Filter Chips：Series / Rarity / Condition / Price Range
 * - 點擊卡 → MakeOfferScreen
 * - FAB：我要放售（直接進入 SellScreen）
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, FlatList,
  TouchableOpacity, TextInput, Image, Dimensions,
  RefreshControl, Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { MarketListing } from '../../types/trade';
import { [] } from '../../data/mockData';

type NavProp = NativeStackNavigationProp<any>;
const { width } = Dimensions.get('window');
const CARD_W = (width - 48 - 12) / 2; // 2 columns + padding

// ─── Filter Options ────────────────────────────────────────────────────────────

const SERIES_OPTIONS = ['全部', 'Sword&Shield', 'Sun&Moon', 'XY', 'Black&White', 'Base'];
const RARITY_OPTIONS = ['全部', 'Rare Holo', 'Rare Ultra', 'Rare Secret', 'Promo', 'Rare'];
const CONDITION_OPTIONS = ['全部', 'Mint', 'Near Mint', 'Excellent', 'Good'];
const PRICE_OPTIONS = [
  { label: '全部', min: 0, max: 999999 },
  { label: '~$200', min: 0, max: 200 },
  { label: '$200~500', min: 200, max: 500 },
  { label: '$500~1,000', min: 500, max: 1000 },
  { label: '$1,000+', min: 1000, max: 999999 },
];

const STATUS_COLORS: Record<string, string> = {
  active: '#00C864',
  sold: '#FF3C3C',
  expired: '#8888AA',
  cancelled: '#6666AA',
};

export const getStatusLabel = (status: string) =>
  ({ active: '熱賣中', sold: '已售出', expired: '已過期', cancelled: '已取消' }[status] ?? status);

// ─── Single Card Tile ────────────────────────────────────────────────────────────

const ListingCard: React.FC<{
  item: MarketListing;
  onPress: () => void;
}> = ({ item, onPress }) => (
  <TouchableOpacity style={styles.cardTile} onPress={onPress} activeOpacity={0.75}>
    <View style={styles.cardImageWrap}>
      {item.card?.imageUrl ? (
        <Image source={{ uri: item.card.imageUrl }} style={styles.cardImage as any} resizeMode="contain" />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
          <Text style={styles.cardImagePlaceholderText}>🎴</Text>
        </View>
      )}
      {/* Status badge */}
      <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] || '#666' }]}>
        <Text style={styles.statusBadgeText}>{getStatusLabel(item.status)}</Text>
      </View>
    </View>
    <View style={styles.cardInfo}>
      <Text style={styles.cardName} numberOfLines={1}>{item.card?.name || '未知卡片'}</Text>
      <Text style={styles.cardSet} numberOfLines={1}>{item.card?.set || ''}</Text>
      <View style={styles.cardPriceRow}>
        <Text style={styles.cardPrice}>HK${item.price.toLocaleString()}</Text>
        {item.condition && (
          <Text style={styles.cardCondition}>{item.condition}</Text>
        )}
      </View>
      <Text style={styles.sellerName}>📦 {item.sellerName}</Text>
    </View>
  </TouchableOpacity>
);

// ─── Skeleton Loader ────────────────────────────────────────────────────────────

const SkeletonCard = () => (
  <View style={[styles.cardTile, { opacity: 0.4 }]}>
    <View style={[styles.cardImage, styles.cardImagePlaceholder]} />
    <View style={{ padding: 8 }}>
      <View style={[styles.skelLine, { width: '80%' }]} />
      <View style={[styles.skelLine, { width: '60%', marginTop: 4 }]} />
      <View style={[styles.skelLine, { width: '40%', marginTop: 6 }]} />
    </View>
  </View>
);

// ─── Main Screen ────────────────────────────────────────────────────────────────

const TradeScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();

  const [listings, setListings] = useState<MarketListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [seriesFilter, setSeriesFilter] = useState('全部');
  const [rarityFilter, setRarityFilter] = useState('全部');
  const [conditionFilter, setConditionFilter] = useState('全部');
  const [priceIdx, setPriceIdx] = useState(0);
  const [searchText, setSearchText] = useState('');
  const [showFilterModal, setShowFilterModal] = useState(false);

  // Load listings
  const loadListings = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const fns = getFunctions();
      const getListings = httpsCallable(fns, 'getMarketListings', { timeout: 20000 });
      const result = await getListings({
        series: seriesFilter !== '全部' ? seriesFilter : undefined,
        rarity: rarityFilter !== '全部' ? rarityFilter : undefined,
        condition: conditionFilter !== '全部' ? conditionFilter : undefined,
        minPrice: PRICE_OPTIONS[priceIdx].min || undefined,
        maxPrice: PRICE_OPTIONS[priceIdx].max < 999999 ? PRICE_OPTIONS[priceIdx].max : undefined,
        type: 'buy_now',
        limit: 30,
      });
      const data = result.data as { listings: MarketListing[]; total: number };
      setListings(data.listings || []);
    } catch (err: any) {
      console.error('loadListings error:', err);
      setError('載入失敗，請稍後重試');
      // Fallback to mock cards (demo mode)
      setListings([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [seriesFilter, rarityFilter, conditionFilter, priceIdx]);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  // Filtered by search text (client-side)
  const displayListings = searchText
    ? listings.filter(l =>
        l.card?.name?.toLowerCase().includes(searchText.toLowerCase()) ||
        l.card?.set?.toLowerCase().includes(searchText.toLowerCase())
      )
    : listings;

  const handleCardPress = (listing: MarketListing) => {
    if (listing.status !== 'active') return;
    navigation.navigate('MakeOffer', { listing });
  };

  const renderItem = ({ item }: { item: MarketListing }) => (
    <ListingCard item={item} onPress={() => handleCardPress(item)} />
  );

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>訓練員，你好 👋</Text>
          <Text style={styles.headerTitle}>📤 卡片交換</Text>
        </View>
        <TouchableOpacity
          style={styles.filterBtn}
          onPress={() => setShowFilterModal(true)}
        >
          <Text style={styles.filterBtnText}>🔍 篩選</Text>
        </TouchableOpacity>
      </View>

      {/* ── Search Bar ── */}
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="搜尋卡名、Series..."
          placeholderTextColor="#6666AA"
          value={searchText}
          onChangeText={setSearchText}
        />
      </View>

      {/* ── Active Filter Chips ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={{ paddingHorizontal: 16 }}
      >
        <TouchableOpacity
          style={[styles.chip, seriesFilter !== '全部' ? styles.chipActive : null]}
          onPress={() => setSeriesFilter('全部')}
        >
          <Text style={[styles.chipText, seriesFilter !== '全部' ? styles.chipTextActive : null]}>
            {seriesFilter}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, rarityFilter !== '全部' ? styles.chipActive : null]}
          onPress={() => setRarityFilter('全部')}
        >
          <Text style={[styles.chipText, rarityFilter !== '全部' ? styles.chipTextActive : null]}>
            {rarityFilter}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, conditionFilter !== '全部' ? styles.chipActive : null]}
          onPress={() => setConditionFilter('全部')}
        >
          <Text style={[styles.chipText, conditionFilter !== '全部' ? styles.chipTextActive : null]}>
            {conditionFilter}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, priceIdx !== 0 ? styles.chipActive : null]}
          onPress={() => setPriceIdx(0)}
        >
          <Text style={[styles.chipText, priceIdx !== 0 ? styles.chipTextActive : null]}>
            {PRICE_OPTIONS[priceIdx].label}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Card Grid ── */}
      {loading ? (
        <View style={styles.grid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      ) : error ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => loadListings()}>
            <Text style={styles.retryBtnText}>重試</Text>
          </TouchableOpacity>
        </View>
      ) : displayListings.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>🎴</Text>
          <Text style={styles.emptyTitle}>目前沒有掛牌卡</Text>
          <Text style={styles.emptySub}>試試調整篩選條件，或先上傳你的收藏卡！</Text>
        </View>
      ) : (
        <FlatList
          data={displayListings}
          keyExtractor={item => item.id}
          numColumns={2}
          columnWrapperStyle={{ paddingHorizontal: 16, gap: 12 }}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadListings(); }}
              tintColor="#FF3C3C"
            />
          }
        />
      )}

      {/* ── FAB: My Offers ── */}
      <TouchableOpacity
        style={styles.fabOffers}
        onPress={() => navigation.navigate('MyOffers')}
      >
        <Text style={styles.fabText}>💬 我的 OFFER</Text>
      </TouchableOpacity>
    </View>
  );
};

// ─── Filter Modal ───────────────────────────────────────────────────────────────

const FilterModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  seriesFilter: string;
  setSeriesFilter: (v: string) => void;
  rarityFilter: string;
  setRarityFilter: (v: string) => void;
  conditionFilter: string;
  setConditionFilter: (v: string) => void;
  priceIdx: number;
  setPriceIdx: (v: number) => void;
  onApply: () => void;
}> = ({
  visible, onClose,
  seriesFilter, setSeriesFilter,
  rarityFilter, setRarityFilter,
  conditionFilter, setConditionFilter,
  priceIdx, setPriceIdx,
  onApply,
}) => {
  const [s, setS] = useState(seriesFilter);
  const [r, setR] = useState(rarityFilter);
  const [c, setC] = useState(conditionFilter);
  const [p, setP] = useState(priceIdx);

  useEffect(() => {
    if (visible) { setS(seriesFilter); setR(rarityFilter); setC(conditionFilter); setP(priceIdx); }
  }, [visible]);

  const apply = () => {
    setSeriesFilter(s); setRarityFilter(r); setConditionFilter(c); setPriceIdx(p);
    onApply();
    onClose();
  };

  const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <View style={{ marginBottom: 20 }}>
      <Text style={styles.modalSectionTitle}>{title}</Text>
      <View style={styles.modalChips}>{children}</View>
    </View>
  );

  const Chip: React.FC<{ label: string; selected: boolean; onPress: () => void }> = ({ label, selected, onPress }) => (
    <TouchableOpacity
      style={[styles.modalChip, selected ? styles.modalChipActive : null]}
      onPress={onPress}
    >
      <Text style={[styles.modalChipText, selected ? styles.modalChipTextActive : null]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>🔍 篩選條件</Text>
            <TouchableOpacity onPress={onClose}><Text style={{ color: '#888' }}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: '75%' }}>
            <Section title="Series">
              {SERIES_OPTIONS.map(opt => (
                <Chip key={opt} label={opt} selected={s === opt} onPress={() => setS(opt)} />
              ))}
            </Section>
            <Section title="稀有度">
              {RARITY_OPTIONS.map(opt => (
                <Chip key={opt} label={opt} selected={r === opt} onPress={() => setR(opt)} />
              ))}
            </Section>
            <Section title="狀態">
              {CONDITION_OPTIONS.map(opt => (
                <Chip key={opt} label={opt} selected={c === opt} onPress={() => setC(opt)} />
              ))}
            </Section>
            <Section title="價格範圍">
              {PRICE_OPTIONS.map((opt, i) => (
                <Chip key={opt.label} label={opt.label} selected={p === i} onPress={() => setP(i)} />
              ))}
            </Section>
          </ScrollView>
          <TouchableOpacity style={styles.applyBtn} onPress={apply}>
            <Text style={styles.applyBtnText}>套用篩選 ✅</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#12121F' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
  },
  greeting: { color: '#8888AA', fontSize: 12 },
  headerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  filterBtn: {
    backgroundColor: '#1E1E2E', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 12, borderWidth: 1, borderColor: '#2A2A3E',
  },
  filterBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1E1E2E', marginHorizontal: 16, borderRadius: 14,
    paddingHorizontal: 14, marginBottom: 12,
    borderWidth: 1, borderColor: '#2A2A3E',
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, color: '#FFFFFF', fontSize: 14, paddingVertical: 13 },
  filterRow: { maxHeight: 40, marginBottom: 12 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#1E1E2E', marginRight: 8, borderWidth: 1, borderColor: '#2A2A3E',
  },
  chipActive: { backgroundColor: '#FF3C3C', borderColor: '#FF3C3C' },
  chipText: { color: '#8888AA', fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 12 },
  cardTile: {
    width: CARD_W, backgroundColor: '#1E1E2E', borderRadius: 14,
    overflow: 'hidden', marginBottom: 12,
    borderWidth: 1, borderColor: '#2A2A3E',
  },
  cardImageWrap: { position: 'relative', height: CARD_W * 1.3 },
  cardImage: { width: '100%', height: '100%', backgroundColor: '#16213E' },
  cardImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  cardImagePlaceholderText: { fontSize: 40, opacity: 0.3 },
  statusBadge: {
    position: 'absolute', top: 6, right: 6,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8,
  },
  statusBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '700' },
  cardInfo: { padding: 8 },
  cardName: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', marginBottom: 2 },
  cardSet: { color: '#8888AA', fontSize: 10, marginBottom: 4 },
  cardPriceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  cardPrice: { color: '#FF3C3C', fontSize: 13, fontWeight: '800' },
  cardCondition: { color: '#8888AA', fontSize: 9 },
  sellerName: { color: '#6666AA', fontSize: 9 },
  skelLine: { height: 10, backgroundColor: '#2A2A3E', borderRadius: 4 },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: '#8888AA', fontSize: 14 },
  retryBtn: { marginTop: 12, backgroundColor: '#1E1E2E', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12 },
  retryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { fontSize: 60, opacity: 0.3 },
  emptyTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginTop: 16 },
  emptySub: { color: '#6666AA', fontSize: 13, marginTop: 8, textAlign: 'center', paddingHorizontal: 40 },
  fabOffers: {
    position: 'absolute', bottom: 90, right: 16,
    backgroundColor: '#FF3C3C', borderRadius: 25,
    paddingHorizontal: 16, paddingVertical: 12,
    shadowColor: '#FF3C3C', shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
  },
  fabText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#1E1E2E', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: '80%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  modalSectionTitle: { color: '#8888AA', fontSize: 12, marginBottom: 10, fontWeight: '600' },
  modalChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modalChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
    backgroundColor: '#12121F', borderWidth: 1, borderColor: '#2A2A3E',
  },
  modalChipActive: { backgroundColor: '#FF3C3C', borderColor: '#FF3C3C' },
  modalChipText: { color: '#8888AA', fontSize: 12 },
  modalChipTextActive: { color: '#FFFFFF', fontWeight: '600' },
  applyBtn: {
    backgroundColor: '#FF3C3C', borderRadius: 14, padding: 15,
    alignItems: 'center', marginTop: 16,
  },
  applyBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});

export default TradeScreen;
