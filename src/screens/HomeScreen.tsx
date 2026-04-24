import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  FlatList, TouchableOpacity, Dimensions,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import CardItem from '../components/CardItem';
import SearchBar from '../components/search/SearchBar';
import { MOCK_CARDS, MOCK_STATS } from '../data/mockData';
import { PokemonCard } from '../types';

type NavProp = NativeStackNavigationProp<any>;
const { width } = Dimensions.get('window');

const SERIES_FILTER = ['全部', 'Sword&Shield', 'Sun&Moon', 'XY', 'Black&White', 'Base'];

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const [searchResults, setSearchResults] = useState<PokemonCard[] | null>(null);
  const [activeFilter, setActiveFilter] = useState('全部');
  const [priceMap, setPriceMap] = useState<Record<string, {
    priceHkd: number; change24h: number; source: string; ageMs: number
  }>>({});
  const [refreshing, setRefreshing] = useState(false);

  const displayCards = searchResults !== null ? searchResults : MOCK_CARDS;
  const filtered = activeFilter === '全部'
    ? displayCards
    : displayCards.filter(c => c.series === activeFilter);

  const { topGainer, topLoser, totalVolume24h } = MOCK_STATS;

  const now = new Date();
  const timeLabel = now.getMinutes() < 5
    ? '剛剛'
    : now.getHours() === 9 ? '港股開市' : `${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`;

  const formatVol = (v: number) =>
    v >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : `$${(v / 1000).toFixed(0)}K`;

  // Load real prices from Firestore for displayed cards
  const loadPrices = useCallback(async (cards: PokemonCard[]) => {
    const { db } = await import('../services/firebase');
    const { collection, doc, getDocs } = await import('firebase/firestore');

    const ids = cards.map(c => c.id).slice(0, 20); // top 20 only
    const priceDocMap: Record<string, any> = {};

    await Promise.allSettled(ids.map(async (id) => {
      const snap = await getDocs(collection(db, 'card_prices'));
      const found = snap.docs.find(d => d.id === id || d.id.includes(id));
      if (found) {
        priceDocMap[id] = { ...found.data(), priceDocId: found.id };
      }
    }));

    // Also try onSnapshot for each — batch query via IN query
    if (ids.length > 0) {
      try {
        const priceSnaps = await getDocs(
          collection(db, 'card_prices')
        );
        const newMap: typeof priceMap = {};
        priceSnaps.docs.forEach(d => {
          if (ids.includes(d.id)) {
            const p = d.data();
            newMap[d.id] = {
              priceHkd: p.priceHkd ?? p.price ?? 0,
              change24h: p.change24h ?? 0,
              source: p.source ?? 'cache',
              ageMs: p.updatedAt ? Date.now() - p.updatedAt : 0,
            };
          }
        });
        if (Object.keys(newMap).length > 0) {
          setPriceMap(prev => ({ ...prev, ...newMap }));
        }
      } catch (e) {
        // Firestore query failed — prices stay as mock
      }
    }
  }, []);

  useEffect(() => {
    // Load prices for displayed cards on mount and on card changes
    if (displayCards.length > 0) {
      loadPrices(displayCards);
    }
  }, [displayCards, loadPrices]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPrices(displayCards);
    setRefreshing(false);
  }, [displayCards, loadPrices]);

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
          tintColor="#FF3C3C"
          colors={['#FF3C3C']}
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
      </View>

      {/* Market Stats Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>24h 成交量</Text>
          <Text style={styles.statValue}>HK${formatVol(totalVolume24h)}</Text>
          <Text style={styles.statSub}>上次更新：{timeLabel}</Text>
        </View>
        <View style={styles.statDivider} />
        <TouchableOpacity
          style={[styles.statItem, styles.statItemClickable]}
          onPress={() => navigation.navigate('CardDetail', { card: enrichCard(topGainer) })}
        >
          <Text style={styles.statLabel}>🚀 今日升幅</Text>
          <Text style={[styles.statValue, styles.textGain]}>
            ▲ {enrichCard(topGainer).priceChange24h.toFixed(1)}%
          </Text>
          <Text style={[styles.statSub, styles.statSubLink]} numberOfLines={1}>
            {topGainer.name} →
          </Text>
        </TouchableOpacity>
        <View style={styles.statDivider} />
        <TouchableOpacity
          style={[styles.statItem, styles.statItemClickable]}
          onPress={() => navigation.navigate('CardDetail', { card: enrichCard(topLoser) })}
        >
          <Text style={styles.statLabel}>📉 今日跌幅</Text>
          <Text style={[styles.statValue, styles.textLoss]}>
            ▼ {enrichCard(topLoser).priceChange24h.toFixed(1)}%
          </Text>
          <Text style={[styles.statSub, styles.statSubLink]} numberOfLines={1}>
            {topLoser.name} →
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search + Version Filter */}
      <SearchBar
        onResults={setSearchResults}
        placeholder="搜尋卡名、Series、Rarity..."
      />

      {/* Series Filter */}
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
          <Text style={styles.priceIndicatorText}>實時行情 · TCGdex 數據</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#12121F' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
  },
  greeting: { color: '#8888AA', fontSize: 12 },
  headerTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  bellBtn: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: '#1E1E2E',
    alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  bellIcon: { fontSize: 20 },
  liveDot: {
    position: 'absolute', top: 10, right: 10, width: 8, height: 8,
    borderRadius: 4, backgroundColor: '#00C864',
  },
  statsBar: {
    flexDirection: 'row', backgroundColor: '#1E1E2E', marginHorizontal: 16,
    borderRadius: 16, padding: 14, marginBottom: 16, alignItems: 'center',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statItemClickable: { paddingVertical: 4 },
  statDivider: { width: 1, height: 40, backgroundColor: '#2A2A3E' },
  statLabel: { color: '#6666AA', fontSize: 10, marginBottom: 4 },
  statValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  statSub: { color: '#8888AA', fontSize: 9, marginTop: 2 },
  statSubLink: { textDecorationLine: 'underline' },
  textGain: { color: '#00C864' },
  textLoss: { color: '#FF3C3C' },
  filterRow: { paddingLeft: 16, marginBottom: 12, maxHeight: 36 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#1E1E2E', marginRight: 8, borderWidth: 1, borderColor: '#2A2A3E',
  },
  filterChipActive: { backgroundColor: '#FFD700', borderColor: '#FFD700' },
  filterText: { color: '#8888AA', fontSize: 12, fontWeight: '600' },
  filterTextActive: { color: '#12121F' },
  priceIndicator: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, marginBottom: 8,
  },
  livePulse: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#00C864',
  },
  priceIndicatorText: { color: '#00C864', fontSize: 10, fontWeight: '600' },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, marginTop: 20, marginBottom: 12,
  },
  sectionTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  seeAll: { color: '#FF3C3C', fontSize: 12, fontWeight: '600' },
  cardList: { paddingHorizontal: 16 },
});

export default HomeScreen;