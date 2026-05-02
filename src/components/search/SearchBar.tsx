import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { PokemonCard } from '../../types';

type VersionFilter = '全部' | '日版' | '中文版' | '英文版';

const VERSION_MAP: Record<VersionFilter, string | null> = {
  '全部': null,
  '日版': 'Japanese',
  '中文版': 'Chinese',
  '英文版': 'English',
};

const VERSION_EMOJI: Record<VersionFilter, string> = {
  '全部': '🌐',
  '日版': '🇯🇵',
  '中文版': '🇭🇰',
  '英文版': '🇺🇸',
};

interface Props {
  onResults: (cards: PokemonCard[]) => void;
  onLoadingChange?: (loading: boolean) => void;
  placeholder?: string;
}

const SearchBar: React.FC<Props> = ({
  onResults,
  onLoadingChange,
  placeholder = '搜尋卡名、Series、Rarity...',
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

    try {
      const searchCards = httpsCallable(getFunctions(), 'searchCardsWithPrices');
      const result = await searchCards({ query: q.trim(), language: lang });
      const raw = result.data as any;
      // Firebase callable SDK wraps in {result: ...} on web; server returns raw {cards}
      const cards = raw?.result?.cards ?? raw?.cards ?? (Array.isArray(raw) ? raw : []);
    } catch (err) {
      console.warn('[SearchBar] searchCards error:', err);
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
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder={placeholder}
            placeholderTextColor="#6666AA"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {loading ? (
            <ActivityIndicator size="small" color="#FF3C3C" style={{ marginRight: 8 }} />
          ) : query.length > 0 ? (
            <TouchableOpacity
              onPress={() => setQuery('')}
              style={{ marginRight: 8, padding: 4 }}
            >
              <Text style={{ color: '#8888AA', fontSize: 16 }}>✕</Text>
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
            <Text style={styles.versionEmoji}>{VERSION_EMOJI[v]}</Text>
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
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  searchRow: {
    marginBottom: 10,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E2E',
    borderRadius: 14,
    paddingHorizontal: 14,
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
  versionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  versionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#1E1E2E',
    borderWidth: 1,
    borderColor: '#2A2A3E',
  },
  versionChipActive: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  versionEmoji: { fontSize: 12 },
  versionText: { color: '#8888AA', fontSize: 12, fontWeight: '600' },
  versionTextActive: { color: '#12121F', fontWeight: '700' },
});

export default SearchBar;