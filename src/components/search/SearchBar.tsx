import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { PokemonCard } from '../../types';
import { searchCardsByName, priceDataToCard } from '../../services/cardPriceService';
import { C, R, SP, T } from '../../theme';

type VersionFilter = '全部' | '日版' | '中文版' | '英文版';

const VERSION_MAP: Record<VersionFilter, string | null> = {
  '全部': null,
  '日版': 'Japanese',
  '中文版': 'Chinese',
  '英文版': 'English',
};

/**
 * The chips used flag emoji. A flag is a country, not a language, and
 * the same emoji renders at a different size on every platform — the
 * chip row was uneven. A globe for "every language" and plain labels
 * for the rest say what they mean and line up.
 */
const VERSION_ICON: Record<VersionFilter, keyof typeof Ionicons.glyphMap | null> = {
  '全部': 'globe-outline',
  '日版': null,
  '中文版': null,
  '英文版': null,
};

interface Props {
  onResults: (cards: PokemonCard[] | null) => void;
  onLoadingChange?: (loading: boolean) => void;
  placeholder?: string;
}

const SearchBar: React.FC<Props> = ({
  onResults,
  onLoadingChange,
  placeholder = '搜尋卡名、系列、稀有度…',
}) => {
  const [query, setQuery] = useState('');
  const [activeVersion, setActiveVersion] = useState<VersionFilter>('全部');
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string, lang: string | null) => {
    // No query → show empty / all cards handled by parent
    if (!q.trim()) {
      onResults(null);  // null → displayCards falls back to realCards
      setLoading(false);
      onLoadingChange?.(false);
      return;
    }

    setLoading(true);
    onLoadingChange?.(true);

    // Try Cloud Function first (server-side full-text search when deployed).
    // If it fails (404 / network), fall back to Firestore direct query.
    try {
      const searchCards = httpsCallable(getFunctions(), 'searchCardsWithPrices');
      const result = await searchCards({ query: q.trim(), language: lang });
      const raw = result.data as any;
      const cards = raw?.result?.cards ?? raw?.cards ?? (Array.isArray(raw) ? raw : []);
      if (cards && cards.length > 0) {
        onResults(cards);
        return;
      }
      // Empty result from function — fall through to Firestore fallback.
    } catch (err) {
      console.warn('[SearchBar] Cloud Function unavailable, using Firestore fallback:', err);
    }

    // Fallback: search Firestore card_prices by name contains
    try {
      const priceDocs = await searchCardsByName(q, 20);
      const cards: PokemonCard[] = priceDocs.map(priceDataToCard);
      onResults(cards);
    } catch (err) {
      console.warn('[SearchBar] Firestore fallback failed:', err);
      onResults([]);
    } finally {
      setLoading(false);
      onLoadingChange?.(false);
    }
  }, [onResults, onLoadingChange]);

  // Debounced search on query or version change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(query, VERSION_MAP[activeVersion]);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, activeVersion, doSearch]);

  const versions: VersionFilter[] = ['全部', '日版', '中文版', '英文版'];

  return (
    <View style={styles.container}>
      {/* Search Input Row */}
      <View style={styles.searchRow}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={C.textTertiary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={placeholder}
            placeholderTextColor={C.textTertiary}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {loading ? (
            <ActivityIndicator size="small" color={C.action} style={styles.searchAction} />
          ) : query.length > 0 ? (
            <TouchableOpacity
              onPress={() => setQuery('')}
              style={styles.searchAction}
              accessibilityRole="button"
              accessibilityLabel="清除搜尋"
            >
              <Ionicons name="close-circle" size={18} color={C.textTertiary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Version Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.versionRow}
      >
        {versions.map(v => (
          <TouchableOpacity
            key={v}
            style={[
              styles.versionChip,
              activeVersion === v ? styles.versionChipActive : null,
            ]}
            onPress={() => setActiveVersion(v)}
            activeOpacity={0.7}
          >
            {VERSION_ICON[v] ? (
              <Ionicons
                name={VERSION_ICON[v] as keyof typeof Ionicons.glyphMap}
                size={13}
                color={activeVersion === v ? C.void : C.textTertiary}
              />
            ) : null}
            <Text style={[
              styles.versionText,
              activeVersion === v ? styles.versionTextActive : null,
            ]}>
              {v}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SP.lg,
    marginBottom: SP.md,
  },
  searchRow: { marginBottom: SP.sm },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: R.md,
    paddingHorizontal: SP.md,
    borderWidth: 1,
    borderColor: C.border,
  },
  searchIcon: { marginRight: SP.sm },
  searchAction: { marginLeft: SP.sm, padding: 2 },
  searchInput: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    paddingVertical: 13,
  },
  versionRow: {
    flexDirection: 'row',
    gap: SP.sm,
  },
  versionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SP.md,
    paddingVertical: 7,
    borderRadius: R.pill,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  versionChipActive: {
    backgroundColor: C.gold,
    borderColor: C.gold,
  },
  versionText: { ...T.caption, color: C.textSecondary },
  versionTextActive: { color: C.void, fontWeight: '700' },
});

export default SearchBar;