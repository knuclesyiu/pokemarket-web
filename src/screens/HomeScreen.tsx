import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  FlatList, TouchableOpacity, Dimensions,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../services/firebase';
import CardItem from '../components/CardItem';
import SearchBar from '../components/search/SearchBar';
import { MOCK_CARDS, MOCK_STATS } from '../data/mockData';
import { PokemonCard } from '../types';

type NavProp = NativeStackNavigationProp<any>;
const { width } = Dimensions.get('window');

const SERIES_FILTER = ['全部', 'Sword&Shield', 'Sun&Moon', 'XY', 'Black&White', 'Base'];

// NEW: Obsidian Gallery design system — color constants
const COLORS = {
  bgVoid: '#080810',
  bgSurface: '#0E0E1A',
  bgCard: '#14142A',
  bgElevated: '#1C1C38',
  borderSubtle: '#2A2A50',
  borderActive: '#3D3D70',
  textPrimary: '#F0F0FF',
  textSecondary: '#8888CC',
  textTertiary: '#4A4A70',
  accentGold: '#D4AF37',
  accentEmber: '#FF6B35',
  accentJade: '#00C896',
  accentRuby: '#FF4060',
  accentViolet: '#8B5CF6',
};

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const [searchResults, setSearchResults] = useState<PokemonCard[] | null>(null);
  const [activeFilter, setActiveFilter] = useState('全部');
  const [marketMode, setMarketMode] = useState<'market' | 'swap'>('market');
  const [priceMap, setPriceMap] = useState<Record<string, {
    priceHkd: number; change24h: number; source: string; ageMs: number
  }>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [realCards, setRealCards] = useState<PokemonCard[]>([]);

  // ── P0: Load real cards from Firestore on mount (not MOCK_CARDS) ─────────
  useEffect(() => {
    const loadRealCards = async () => {
      try {
        const q = query(collection(db, 'card_prices'), where('imageUrl', '!=', ''), where('priceHkd', '>', 0));
        const snap = await getDocs(q);
        const cards: PokemonCard[] = [];
        snap.forEach(d => {
          const p = d.data();
          cards.push({
            id: d.id,
            name: p.name ?? d.id,
            set: p.set ?? '',
            setCode: p.setCode ?? '',
            rarity: p.rarity ?? 'Common',
            series: p.series ?? 'Other',
            number: p.number ?? '',
            price: p.priceHkd ?? 0,
            priceChange24h: p.change24h ?? 0,
            imageUrl: p.imageUrl ?? '',
            condition: 'Near Mint',
            language: (p.language as PokemonCard['language']) ?? 'English',
            listed: true,
            listingCount: 0,
          });
        });
        setRealCards(cards);
        if (cards.length > 0) loadPrices(cards.slice(0, 30));
      } catch (e) {
        console.warn('[Home] Firestore load failed:', e);
        setRealCards(MOCK_CARDS);
      }
    };
    loadRealCards();
  }, []);

  // P0: displayCards = searchResults > realCards > MOCK_CARDS
  const displayCards = useMemo(() => {
    if (searchResults !== null) return searchResults;
    if (realCards.length > 0) return realCards;
    return MOCK_CARDS;
  }, [searchResults, realCards]);

  const filtered = activeFilter === '全部'
    ? displayCards
    : displayCards.filter(c =>
        c.series?.toLowerCase().includes(activeFilter.toLowerCase()) ||
        c.set?.toLowerCase().includes(activeFilter.toLowerCase())
      );

  const { topGainer, topLoser, totalVolume24h } = MOCK_STATS;

  const now = new Date();
  const timeLabel = now.getMinutes() < 5
    ? '剛剛'
    : now.getHours() === 9 ? '港股開市' : `${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`;

  const formatVol = (v: number) =>
    v >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : `$${(v / 1000).toFixed(0)}K`;

  // P1.4: single-batch price load — all 30 cards in ONE Firestore round-trip
  const loadPrices = useCallback(async (cards: PokemonCard[]) => {
    const ids = cards.map(c => c.id).filter(Boolean);
    if (ids.length === 0) return;
    const BATCH = 30;
    const results: typeof priceMap = {};
    for (let i = 0; i < ids.length; i += BATCH) {
      try {
        const batch = ids.slice(i, i + BATCH);
        const snap = await getDocs(query(collection(db, 'card_prices'), where('id', 'in', batch)));
        snap.forEach(d => {
          const p = d.data();
          results[d.id] = {
            priceHkd: p.priceHkd ?? 0,
            change24h: p.change24h ?? 0,
            source: p.source ?? 'cache',
            ageMs: p.updatedAt ? Date.now() - p.updatedAt : 0,
          };
        });
      } catch (e) { console.warn('[loadPrices] batch error:', e); }
    }
    if (Object.keys(results).length > 0) {
      setPriceMap(prev => ({ ...prev, ...results }));
      setLastUpdated(new Date());
    }
  }, []);

  useEffect(() => {
    if (displayCards.length > 0) loadPrices(displayCards);
  }, [displayCards, loadPrices]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPrices(displayCards);
    setRefreshing(false);
  }, [displayCards, loadPrices]);

  const formatLastUpdated = () => {
    if (!lastUpdated) return null;
    const diff = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (diff < 60) return '剛剛';
    if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`;
    return `${Math.floor(diff / 3600)} 小時前`;
  };
  const fmtLastUpdated = useMemo(() => formatLastUpdated(), [lastUpdated]);

  // Enrich cards with real prices
  const enrichCard = (card: PokemonCard) => {
    const live = priceMap[card.id];
    return {
      ...card,
      price: live?.priceHkd ?? card.price,
      priceChange24h: live?.change24h ?? card.priceChange24h,
    };
  };

  const enrichedFiltered = filtered.map(enrichCard);
  const enrichedTrending = MOCK_STATS.trendingCards.map(enrichCard);

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={COLORS.accentGold}
          colors={[COLORS.accentGold]}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>訓練員，你好 👋</Text>
          <Text style={styles.headerTitle}>PokéMarket</Text>
        </View>
        <TouchableOpacity style={styles.bellBtn}>
          <Text style={styles.bellIcon}>🔔</Text>
          {priceMap[Object.keys(priceMap)[0]]?.source === 'live' && (
            <View style={styles.liveDot} />
          )}
        </TouchableOpacity>
        {syncing && (
          <Text style={styles.syncBadge}>🔄 同步行情中...</Text>
        )}
      </View>

      {/* Market Stats Bar — elevated card, jade/ruby stats, gold volume */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>24h 成交量</Text>
          <Text style={styles.statValueGold}>HK${formatVol(totalVolume24h)}</Text>
          <Text style={styles.statSub}>上次更新：{timeLabel}</Text>
        </View>
        <View style={styles.statDivider} />
        <TouchableOpacity
          style={[styles.statItem, styles.statItemClickable]}
          onPress={() => navigation.navigate('CardDetail', { card: enrichCard(topGainer) })}
        >
          <Text style={styles.statLabel}>🚀 今日升幅</Text>
          <Text style={styles.statValueJade}>
            ▲ {enrichCard(topGainer).priceChange24h.toFixed(1)}%
          </Text>
          <Text style={styles.statSubLink} numberOfLines={1}>
            {topGainer.name} →
          </Text>
        </TouchableOpacity>
        <View style={styles.statDivider} />
        <TouchableOpacity
          style={[styles.statItem, styles.statItemClickable]}
          onPress={() => navigation.navigate('CardDetail', { card: enrichCard(topLoser) })}
        >
          <Text style={styles.statLabel}>📉 今日跌幅</Text>
          <Text style={styles.statValueRuby}>
            ▼ {enrichCard(topLoser).priceChange24h.toFixed(1)}%
          </Text>
          <Text style={styles.statSubLink} numberOfLines={1}>
            {topLoser.name} →
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search + Version Filter */}
      <SearchBar
        onResults={setSearchResults}
        placeholder="搜尋卡名、Series、Rarity..."
      />

      {/* Series Filter — gold active state */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {SERIES_FILTER.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, activeFilter === f && styles.filterChipActive]}
            onPress={() => setActiveFilter(f)}
          >
            <Text style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>
              {f}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Live price indicator */}
      {Object.keys(priceMap).length > 0 && (
        <View style={styles.priceIndicator}>
          <View style={styles.livePulse} />
          <Text style={styles.priceIndicatorText}>
            實時行情 · TCGdex{fmtLastUpdated ? ` · 更新於 ${fmtLastUpdated}` : ''}
          </Text>
        </View>
      )}

      {/* Trending Cards */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>🔥 熱門卡</Text>
        <TouchableOpacity>
          <Text style={styles.seeAll}>查看全部 →</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        horizontal
        data={enrichedTrending}
        keyExtractor={item => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingLeft: 16, paddingRight: 8 }}
        renderItem={({ item }) => (
          <CardItem
            card={item}
            compact
            onPress={() => navigation.navigate('CardDetail', { card: item })}
          />
        )}
      />

      {/* Market Listings */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>📊 市場掛牌</Text>
        <TouchableOpacity>
          <Text style={styles.seeAll}>
            全部 {enrichedFiltered.length} 張 →
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.cardList}>
        {enrichedFiltered.slice(0, 6).map(card => (
          <CardItem
            key={card.id}
            card={card}
            onPress={() => navigation.navigate('CardDetail', { card })}
          />
        ))}
      </View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
};

// NEW: Obsidian Gallery design system
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080810' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
  },
  greeting: { color: '#8888CC', fontSize: 12 },
  headerTitle: { color: '#F0F0FF', fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  syncBadge: { color: '#8888CC', fontSize: 10, marginLeft: 8 },
  bellBtn: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: '#14142A',
    alignItems: 'center', justifyContent: 'center', position: 'relative',
    borderWidth: 1, borderColor: '#2A2A50',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  bellIcon: { fontSize: 20 },
  liveDot: {
    position: 'absolute', top: 10, right: 10, width: 8, height: 8,
    borderRadius: 4, backgroundColor: '#00C896',
  },
  // NEW: elevated card with gold volume, jade/ruby stat colors
  statsBar: {
    flexDirection: 'row',
    backgroundColor: '#14142A',   // elevated card surface
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2A50',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statItemClickable: { paddingVertical: 4 },
  statDivider: { width: 1, height: 40, backgroundColor: '#2A2A50' },
  statLabel: { color: '#8888CC', fontSize: 10, marginBottom: 4 },
  statValueGold: { color: '#D4AF37', fontSize: 14, fontWeight: '800' },   // NEW: gold volume
  statValueJade: { color: '#00C896', fontSize: 14, fontWeight: '700' },   // NEW: jade gain
  statValueRuby: { color: '#FF4060', fontSize: 14, fontWeight: '700' },   // NEW: ruby loss
  statSub: { color: '#8888CC', fontSize: 9, marginTop: 2 },
  statSubLink: { color: '#D4AF37', fontSize: 9, marginTop: 2, textDecorationLine: 'underline' },
  // NEW: gold active filter chips
  filterRow: { paddingLeft: 16, marginBottom: 12, maxHeight: 36 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#14142A', marginRight: 8,
    borderWidth: 1, borderColor: '#2A2A50',
  },
  filterChipActive: {
    backgroundColor: '#D4AF37',
    borderColor: '#D4AF37',
    // subtle gold glow
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  filterText: { color: '#8888CC', fontSize: 12, fontWeight: '600' },
  filterTextActive: { color: '#080810', fontWeight: '700' },
  priceIndicator: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, marginBottom: 8,
  },
  livePulse: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#00C896',
  },
  priceIndicatorText: { color: '#00C896', fontSize: 10, fontWeight: '600' },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, marginTop: 20, marginBottom: 12,
  },
  sectionTitle: { color: '#F0F0FF', fontSize: 16, fontWeight: '700' },
  seeAll: { color: '#D4AF37', fontSize: 12, fontWeight: '600' },   // NEW: gold link
  cardList: { paddingHorizontal: 16 },
});

export default HomeScreen;