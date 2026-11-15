import { useState, useEffect, useCallback, useMemo } from 'react';
import { t } from '../i18n';
import { useAppearance } from '../contexts/AppearanceContext';
import {
  View, Text, ScrollView, StyleSheet,
  FlatList, TouchableOpacity, Dimensions,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../services/firebase';
import {
  HOME_FEED_MIN_PRICE_HKD,
  HOME_FEED_MAX_PRICE_HKD,
  HOME_FEED_LIMIT,
} from '../config/platform';
import { getCardPrice, getCardPrices, priceDataToCard, CardPriceData } from '../services/cardPriceService';
import Ionicons from '@expo/vector-icons/Ionicons';
import CardItem from '../components/CardItem';
import SearchBar from '../components/search/SearchBar';
import { C, R, SP, T, themed } from '../theme';

import { PokemonCard } from '../types';

type NavProp = NativeStackNavigationProp<any>;
const { width } = Dimensions.get('window');

const SERIES_FILTER = [t('全部'), 'Sword&Shield', 'Sun&Moon', 'XY', 'Black&White', 'Base'];

// NEW: Obsidian Gallery design system — color constants
const COLORS = {
  bgVoid: C.void,
  bgSurface: C.surface,
  bgCard: C.card,
  bgElevated: C.elevated,
  borderSubtle: C.border,
  borderActive: C.borderActive,
  textPrimary: C.text,
  textSecondary: C.textSecondary,
  textTertiary: C.textDisabled,
  accentRed: C.action,
  accentEmber: C.warn,
  accentJade: C.up,
  accentRuby: C.ruby,
  accentViolet: C.violet,
};

/**
 * The empty state.
 *
 * A section heading with nothing under it reads as a broken screen.
 * Saying what is missing and what to do about it is the difference
 * between "empty" and "broken".
 */
const EmptyState: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}> = ({ icon, title, body }) => (
  <View style={styles.emptyState}>
    <View style={styles.emptyIcon}>
      <Ionicons name={icon} size={22} color={C.textTertiary} />
    </View>
    <Text style={styles.emptyTitle}>{title}</Text>
    <Text style={styles.emptyBody}>{body}</Text>
  </View>
);

const HomeScreen: React.FC = () => {
  const { t } = useAppearance();

  const navigation = useNavigation<NavProp>();
  const [searchResults, setSearchResults] = useState<PokemonCard[] | null>(null);
  const [activeFilter, setActiveFilter] = useState(t('全部'));
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
        // Only cards that carry a real market price, in the band a
        // collector would actually trade in. See HOME_FEED_* in
        // config/platform for why the band exists.
        const snap = await getDocs(
          query(
            collection(db, 'card_prices'),
            where('priceHkd', '>=', HOME_FEED_MIN_PRICE_HKD),
            where('priceHkd', '<=', HOME_FEED_MAX_PRICE_HKD),
            orderBy('priceHkd', 'desc'),
            limit(HOME_FEED_LIMIT),
          ),
        );
        const cards: PokemonCard[] = [];
        snap.forEach(d => {
          // Use the normalized helper so imageUrl is a full https URL
          // (TCGdex sync wrote relative paths; helper adds host + /high.png)
          const p = d.data();
          // Cheap inline normalize: prefer the helper's full path, fall
          // back to whatever the doc has.
          let imageUrl = p.imageUrl ?? '';
          if (imageUrl && !imageUrl.startsWith('http')) {
            imageUrl = imageUrl.startsWith('/')
              ? `https://api.tcgdex.net${imageUrl}/high.png`
              : `https://api.tcgdex.net/${imageUrl}/high.png`;
          } else if (imageUrl && !/\.(png|jpg|webp|jpeg)$/i.test(imageUrl)) {
            imageUrl = `${imageUrl.replace(/\/?$/, '')}/high.png`;
          }
          cards.push({
            id: d.id,
            name: p.name ?? d.id,
            set: p.set ?? '',
            setCode: p.setCode ?? '',
            rarity: p.rarity ?? 'Common',
            series: p.series ?? 'Other',
            number: String(p.number ?? p.localId ?? ''),
            price: p.cardmarketHkd ?? p.priceHkd ?? 0,
            priceChange24h: p.change24hPct ?? p.change24h ?? 0,
            imageUrl,
            condition: 'Near Mint',
            language: (p.language as PokemonCard['language']) ?? 'English',
            listed: true,
            listingCount: 0,
          });
        });
        setRealCards(cards);
        // Prices are loaded by the useEffect below — no need to call here.
      } catch (e) {
        console.warn('[Home] Firestore load failed:', e);
      }
    };
    loadRealCards();
  }, []);

  // displayCards = searchResults > realCards > []
  const displayCards = useMemo(() => {
    if (searchResults !== null) return searchResults;
    if (realCards.length > 0) return realCards;
    return [];
  }, [searchResults, realCards]);

  const filtered = activeFilter === t('全部')
    ? displayCards
    : displayCards.filter(c =>
        c.series?.toLowerCase().includes(activeFilter.toLowerCase()) ||
        c.set?.toLowerCase().includes(activeFilter.toLowerCase())
      );

  const now = new Date();
  const timeLabel = now.getMinutes() < 5
    ? t('剛剛')
    : now.getHours() === 9 ? t('港股開市') : `${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`;

  const formatVol = (v: number) =>
    v >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : `$${(v / 1000).toFixed(0)}K`;

  // P1.4: single-batch price load — all 30 cards in ONE Firestore round-trip
  const loadPrices = useCallback(async (cards: PokemonCard[]) => {
    const ids = cards.map(c => c.id).filter(Boolean);
    if (ids.length === 0) return;
    try {
      // Use the normalized cardPriceService helper which also fixes
      // TCGdex image paths (adds /high.png suffix, prepends api.tcgdex.net
      // when the sync only wrote the relative path).
      const docs = await getCardPrices(ids);
      const results: typeof priceMap = {};
      Object.values(docs).forEach(d => {
        results[d.id] = {
          priceHkd: d.priceHkd,
          change24h: d.change24hPct,
          source: d.source,
          ageMs: d.fetchedAtTs ? Date.now() - d.fetchedAtTs : 0,
        };
      });
      if (Object.keys(results).length > 0) {
        setPriceMap(prev => ({ ...prev, ...results }));
        setLastUpdated(new Date());
      }
    } catch (e) { console.warn('[loadPrices] error:', e); }
  }, []);

  // Re-fetch prices when the visible card set changes. We depend on
  // a stable identifier (the joined card IDs) so we don't re-fire on
  // every render (array reference changes via priceMap update).
  useEffect(() => {
    if (displayCards.length > 0) loadPrices(displayCards);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayCards.map(c => c.id).join(','), loadPrices]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPrices(displayCards);
    setRefreshing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayCards.map(c => c.id).join(','), loadPrices]);

  const formatLastUpdated = () => {
    if (!lastUpdated) return null;
    const diff = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (diff < 60) return t('剛剛');
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
  const enrichedTrending = (displayCards.length > 0 ? displayCards.slice(0, 20) : []).map(enrichCard);

  /**
   * The biggest mover in each direction.
   *
   * The stats bar used to show a hard-coded `--` and had an empty
   * press handler, so three tiles said nothing and did nothing. The
   * 24-hour change is already loaded for every card on the feed, so
   * the tile can show the card that actually moved — and tapping it
   * can open that card.
   */
  const movers = useMemo(() => {
    const withChange = enrichedFiltered.filter(
      (c) => typeof c.priceChange24h === 'number' && c.priceChange24h !== 0,
    );
    if (withChange.length < 2) return null;
    const sorted = [...withChange].sort((a, b) => b.priceChange24h - a.priceChange24h);
    return { up: sorted[0], down: sorted[sorted.length - 1] };
  }, [enrichedFiltered]);

  /** How many of the loaded cards carry a live quote. */
  const quotedCount = Object.keys(priceMap).length;

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={COLORS.accentRed}
          colors={[COLORS.accentRed]}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{t('訓練員，你好')}</Text>
          <Text style={styles.headerTitle}>PokéMarket</Text>
        </View>
        <TouchableOpacity
          style={styles.bellBtn}
          onPress={() => navigation.navigate('Notifications')}
          accessibilityRole="button"
          accessibilityLabel={t('通知')}
        >
          <Ionicons name="notifications-outline" size={20} color={C.text} />
          {priceMap[Object.keys(priceMap)[0]]?.source === 'tcgdex' && (
            <View style={styles.liveDot} />
          )}
        </TouchableOpacity>
        {syncing && (
          <Text style={styles.syncBadge}>{t('同步行情中…')}</Text>
        )}
      </View>

      {/* Market stats — real numbers, and tapping one opens the card */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>{t('實時報價')}</Text>
          <Text style={styles.statValueGold}>{quotedCount}</Text>
          <Text style={styles.statSub} numberOfLines={1}>上次更新：{timeLabel}</Text>
        </View>
        <View style={styles.statDivider} />
        <TouchableOpacity
          style={[styles.statItem, styles.statItemClickable]}
          onPress={() =>
            movers?.up && navigation.navigate('CardDetail', { card: movers.up })
          }
          disabled={!movers}
        >
          <Text style={styles.statLabel}>{t('今日升幅')}</Text>
          <Text style={styles.statValueJade}>
            {movers ? `+${movers.up.priceChange24h.toFixed(1)}%` : '--'}
          </Text>
          <Text style={styles.statSubLink} numberOfLines={1}>
            {movers ? movers.up.name : t('未有升跌數據')}
          </Text>
        </TouchableOpacity>
        <View style={styles.statDivider} />
        <TouchableOpacity
          style={[styles.statItem, styles.statItemClickable]}
          onPress={() =>
            movers?.down && navigation.navigate('CardDetail', { card: movers.down })
          }
          disabled={!movers}
        >
          <Text style={styles.statLabel}>{t('今日跌幅')}</Text>
          <Text style={styles.statValueRuby}>
            {movers ? `${movers.down.priceChange24h.toFixed(1)}%` : '--'}
          </Text>
          <Text style={styles.statSubLink} numberOfLines={1}>
            {movers ? movers.down.name : t('未有升跌數據')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search + Version Filter */}
      <SearchBar
        onResults={setSearchResults}
        placeholder={t('搜尋卡名、系列、稀有度…')}
      />

      {/* Series Filter — gold active state */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {SERIES_FILTER.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, activeFilter === f ? styles.filterChipActive : null]}
            onPress={() => setActiveFilter(f)}
          >
            <Text style={[styles.filterText, activeFilter === f ? styles.filterTextActive: null]}>
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
        <View style={styles.sectionTitleRow}>
          <Ionicons name="flame" size={16} color={C.action} />
          <Text style={styles.sectionTitle}>{t('熱門卡')}</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Main')}>
          <Text style={styles.seeAll}>{t('查看全部 →')}</Text>
        </TouchableOpacity>
      </View>
      {enrichedTrending.length === 0 ? (
        <EmptyState
          icon="cloud-offline-outline"
          title={t('暫時攞唔到行情')}
          body={t('價格服務未回應，或者未有卡喺呢個價位帶。向下拉可以重新整理。')}
        />
      ) : (
        <FlatList
          horizontal
          data={enrichedTrending}
          keyExtractor={item => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingLeft: SP.lg, paddingRight: SP.sm }}
          renderItem={({ item }) => (
            <CardItem
              card={item}
              compact
              onPress={() => navigation.navigate('CardDetail', { card: item })}
            />
          )}
        />
      )}

      {/* Market Listings */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="stats-chart" size={16} color={C.gold} />
          <Text style={styles.sectionTitle}>{t('市場掛牌')}</Text>
        </View>
        <TouchableOpacity>
          <Text style={styles.seeAll}>
            全部 {enrichedFiltered.length} 張 →
          </Text>
        </TouchableOpacity>
      </View>
      {enrichedFiltered.length === 0 ? (
        <EmptyState
          icon="card-outline"
          title={t('未有掛牌')}
          body={t('市場暫時未有掛牌嘅卡。撳下面「全部」睇現貨價格，或者自己掛一張。')}
        />
      ) : (
        <View style={styles.cardList}>
          {enrichedFiltered.slice(0, 6).map(card => (
            <CardItem
              key={card.id}
              card={card}
              onPress={() => navigation.navigate('CardDetail', { card })}
            />
          ))}
        </View>
      )}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = themed((C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.void },

  // ─── Header ───────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SP.lg,
    paddingTop: 56,
    paddingBottom: SP.md,
  },
  greeting: { ...T.caption, color: C.textSecondary },
  headerTitle: { ...T.title, color: C.text, marginTop: 2 },
  syncBadge: { ...T.caption, color: C.textTertiary, marginLeft: SP.sm },
  bellBtn: {
    width: 44,
    height: 44,
    borderRadius: R.md,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  liveDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.up,
  },

  // ─── Stats ────────────────────────────────────────────────────────────────
  statsBar: {
    flexDirection: 'row',
    backgroundColor: C.card,
    marginHorizontal: SP.lg,
    borderRadius: R.lg,
    padding: SP.md,
    marginBottom: SP.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statItemClickable: { paddingVertical: 4 },
  statDivider: { width: 1, height: 40, backgroundColor: C.border },
  statLabel: { ...T.overline, color: C.textTertiary, marginBottom: 4 },
  statValueGold: { ...T.price, fontSize: 16, color: C.gold },
  statValueJade: { ...T.price, fontSize: 16, color: C.up },
  statValueRuby: { ...T.price, fontSize: 16, color: C.down },
  statSub: { ...T.caption, fontSize: 9, color: C.textTertiary, marginTop: 2 },
  statSubLink: {
    ...T.caption,
    fontSize: 9,
    marginTop: 2,
    color: C.textSecondary,
    textDecorationLine: 'underline',
  },

  // ─── Filters ──────────────────────────────────────────────────────────────
  filterRow: { paddingLeft: SP.lg, marginBottom: SP.md, maxHeight: 38 },
  filterChip: {
    paddingHorizontal: SP.md,
    paddingVertical: 7,
    borderRadius: R.pill,
    backgroundColor: C.card,
    marginRight: SP.sm,
    borderWidth: 1,
    borderColor: C.border,
  },
  filterChipActive: {
    backgroundColor: C.action,
    borderColor: C.action,
    shadowColor: C.action,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  filterText: { ...T.caption, color: C.textSecondary },
  filterTextActive: { color: C.void, fontWeight: '700' },

  // ─── Live indicator ───────────────────────────────────────────────────────
  priceIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SP.lg,
    marginBottom: SP.sm,
  },
  livePulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.up },
  priceIndicatorText: { ...T.caption, color: C.up, fontSize: 10 },

  // ─── Sections ─────────────────────────────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SP.lg,
    marginTop: SP.xl,
    marginBottom: SP.md,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { ...T.heading, color: C.text },
  seeAll: { ...T.caption, color: C.action },
  cardList: { paddingHorizontal: SP.lg },

  // ─── Empty state ──────────────────────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    paddingVertical: SP.xxl,
    paddingHorizontal: SP.xl,
    marginHorizontal: SP.lg,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: 'dashed',
    backgroundColor: C.surface,
  },
  emptyIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SP.md,
  },
  emptyTitle: { ...T.bodyStrong, color: C.text, marginBottom: 4 },
  emptyBody: {
    ...T.small,
    color: C.textTertiary,
    textAlign: 'center',
    lineHeight: 19,
  },
}))

export default HomeScreen;