import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Image,
  TextInput, FlatList, TouchableOpacity, Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import CardItem from '../components/CardItem';
import { MOCK_CARDS, MOCK_STATS } from '../data/mockData';
import { PokemonCard } from '../types';

type NavProp = NativeStackNavigationProp<any>;

const { width } = Dimensions.get('window');

const SERIES_FILTER = ['全部', 'Sword&Shield', 'Sun&Moon', 'XY', 'Black&White', 'Base'];

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('全部');

  const filtered = MOCK_CARDS.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const { topGainer, topLoser, totalVolume24h } = MOCK_STATS;

  const formatVol = (v: number) =>
    v >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : `$${(v / 1000).toFixed(0)}K`;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>訓練員，你好 👋</Text>
          <Text style={styles.headerTitle}>PokéMarket</Text>
        </View>
        <TouchableOpacity style={styles.bellBtn}>
          <Text style={styles.bellIcon}>🔔</Text>
          <View style={styles.bellDot} />
        </TouchableOpacity>
      </View>

      {/* Market Stats Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>24h 成交量</Text>
          <Text style={styles.statValue}>HK${formatVol(totalVolume24h)}</Text>
        </View>
        <View style={styles.statDivider} />
        <TouchableOpacity
          style={[styles.statItem, styles.statItemClickable]}
          onPress={() => navigation.navigate('CardDetail', { card: topGainer })}
        >
          <Text style={styles.statLabel}>🚀 今日升幅</Text>
          <Text style={[styles.statValue, styles.textGain]}>
            ▲ {topGainer.priceChange24h.toFixed(1)}%
          </Text>
          <Text style={styles.statSub} numberOfLines={1}>{topGainer.name}</Text>
        </TouchableOpacity>
        <View style={styles.statDivider} />
        <TouchableOpacity
          style={[styles.statItem, styles.statItemClickable]}
          onPress={() => navigation.navigate('CardDetail', { card: topLoser })}
        >
          <Text style={styles.statLabel}>📉 今日跌幅</Text>
          <Text style={[styles.statValue, styles.textLoss]}>
            ▼ {topLoser.priceChange24h.toFixed(1)}%
          </Text>
          <Text style={styles.statSub} numberOfLines={1}>{topLoser.name}</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="搜尋卡名、Series、Rarity..."
          placeholderTextColor="#6666AA"
          value={search}
          onChangeText={setSearch}
        />
      </View>

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

      {/* Trending Cards */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>🔥 熱門卡</Text>
        <TouchableOpacity>
          <Text style={styles.seeAll}>查看全部 →</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        horizontal
        data={MOCK_STATS.trendingCards}
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
          <Text style={styles.seeAll}>全部 {filtered.length} 張 →</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.cardList}>
        {filtered.slice(0, 6).map(card => (
          <CardItem
            key={card.id}
            card={card}
            onPress={() => navigation.navigate('CardDetail', { card })}
          />
        ))}
      </View>

      {/* Bottom padding */}
      <View style={{ height: 100 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#12121F',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
  },
  greeting: {
    color: '#8888AA',
    fontSize: 12,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  bellBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#1E1E2E',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  bellIcon: { fontSize: 20 },
  bellDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3C3C',
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: '#1E1E2E',
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statItemClickable: {
    paddingVertical: 4,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#2A2A3E',
  },
  statLabel: {
    color: '#6666AA',
    fontSize: 10,
    marginBottom: 4,
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  statSub: {
    color: '#8888AA',
    fontSize: 9,
    marginTop: 2,
  },
  textGain: { color: '#00C864' },
  textLoss: { color: '#FF3C3C' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E2E',
    marginHorizontal: 16,
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2A2A3E',
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    paddingVertical: 13,
  },
  filterRow: {
    paddingLeft: 16,
    marginBottom: 16,
    maxHeight: 36,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#1E1E2E',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#2A2A3E',
  },
  filterChipActive: {
    backgroundColor: '#FF3C3C',
    borderColor: '#FF3C3C',
  },
  filterText: {
    color: '#8888AA',
    fontSize: 12,
    fontWeight: '600',
  },
  filterTextActive: { color: '#FFFFFF' },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  seeAll: {
    color: '#FF3C3C',
    fontSize: 12,
    fontWeight: '600',
  },
  cardList: {
    paddingHorizontal: 16,
  },
});

export default HomeScreen;
