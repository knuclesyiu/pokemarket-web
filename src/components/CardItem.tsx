import React, { useEffect, useRef } from 'react';
import {
  View, Text, Image, StyleSheet, TouchableOpacity, Animated,
} from 'react-native';
import { PokemonCard } from '../types';

// ─── Rarity Config ─────────────────────────────────────────────────────────────
type RarityTier = 'standard' | 'holo' | 'ultra' | 'legendary';

const RARITY_TIER: Record<string, RarityTier> = {
  'Rare Ultra':     'ultra',
  'Rare Secret':    'legendary',
  'Rare Holo':      'holo',
  'Rare':           'holo',
  'Promo':          'holo',
  'Uncommon':       'standard',
  'Common':         'standard',
};

const RARITY_BORDER: Record<RarityTier, string> = {
  standard:   '#2A2A50',
  holo:       '#D4AF37',
  ultra:      '#D4AF37',
  legendary:  '#D4AF37',
};

const RARITY_GLOW: Record<RarityTier, string> = {
  standard:   'transparent',
  holo:       'rgba(212,175,55,0.15)',
  ultra:      'rgba(212,175,55,0.25)',
  legendary:  'rgba(212,175,55,0.4)',
};

const RARITY_BADGE: Record<RarityTier, { emoji: string; label: string }> = {
  standard:   { emoji: '⚪', label: '' },
  holo:       { emoji: '✨', label: 'Holo' },
  ultra:      { emoji: '⭐', label: 'Ultra' },
  legendary:  { emoji: '👑', label: 'LEGEND' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatPrice = (price: number): string => {
  if (price >= 1000000) return `HK$ ${(price / 1000000).toFixed(1)}M`;
  if (price >= 1000)    return `HK$ ${(price / 1000).toFixed(1)}K`;
  return `HK$ ${price}`;
};

const ELEMENT_COLORS: Record<string, string> = {
  fire: '#FF6B35', water: '#4A90D9', grass: '#52C41A',
  lightning: '#FADB14', psychic: '#B371CF', dark: '#5A4FCF',
  dragon: '#FF4D4F', normal: '#8C8C8C',
};
const ELEMENT_MAP: Record<string, string> = {
  Charizard: 'fire', Gengar: 'psychic', Rayquaza: 'dragon',
  Pikachu: 'lightning', Umbreon: 'dark', Lugia: 'psychic',
  Gardevoir: 'psychic', Blastoise: 'water', Darkrai: 'dark',
};
const getElementColor = (name: string) =>
  ELEMENT_COLORS[ELEMENT_MAP[name.split(' ')[0]] ?? 'normal'] ?? '#8C8C8C';

const getRarityTier = (rarity: string): RarityTier =>
  RARITY_TIER[rarity] ?? 'standard';

const isShiny = (name: string) =>
  name.toLowerCase().includes('1st edition') ||
  name.toLowerCase().includes('shiny') ||
  name.toLowerCase().includes('legendary');

// ─── Shimmer ──────────────────────────────────────────────────────────────────
const ShimmerBar: React.FC<{ tier: RarityTier; color: string }> = ({ tier, color }) => {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (tier === 'legendary') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerAnim, {
            toValue: 1,
            duration: 1400,
            useNativeDriver: false, // RN 0.81+ Android fix
          }),
          Animated.timing(shimmerAnim, {
            toValue: 0,
            duration: 1400,
            useNativeDriver: false, // RN 0.81+ Android fix
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [tier]);

  const shimmerStyle = tier === 'legendary' ? {
    opacity: shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
  } : { opacity: 0.7 };

  return (
    <Animated.View
      style={[
        styles.shimmerBar,
        { backgroundColor: color },
        shimmerStyle,
      ]}
    />
  );
};

// ─── Main Component ────────────────────────────────────────────────────────────
interface CardItemProps {
  card: PokemonCard;
  onPress?: () => void;
  compact?: boolean;
}

const CardItem: React.FC<CardItemProps> = ({ card, onPress, compact }) => {
  const tier        = getRarityTier(card.rarity);
  const isLegendary = tier === 'legendary';
  const isShinyCard = isShiny(card.name);
  const isGain      = card.priceChange24h >= 0;
  const elementColor = getElementColor(card.name);
  const isTopCard   = card.priceChange24h >= 8;

  // ── Compact layout ─────────────────────────────────────────────────────────
  if (compact) {
    const borderColor = RARITY_BORDER[tier];
    const glowColor  = RARITY_GLOW[tier];

    return (
      <TouchableOpacity
        style={[
          styles.compactCard,
          isLegendary ? styles.compactCardLegendary,
          { borderColor, shadowColor: borderColor },
          glowColor !== 'transparent' && { shadowColor: borderColor, shadowOpacity: 0.4 },
        ]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        {isLegendary && <ShimmerBar tier={tier} color={borderColor} />}

        {/* Shiny / Legendary crown badge */}
        {(isLegendary || isShinyCard) && (
          <View style={styles.crownBadge}>
            <Text style={styles.crownBadgeText}>
              {isLegendary ? '👑' : '✨'}
            </Text>
          </View>
        )}

        <Image source={{ uri: card.imageUrl }} style={styles.compactImage} />
        <Text style={styles.compactName} numberOfLines={1}>
          {card.name.replace(' VMAX', '\nVMAX')}
        </Text>
        <Text style={[styles.compactPrice, tier !== 'standard' ? styles.priceGold]}>
          {formatPrice(card.price)}
        </Text>
        <View style={[styles.badge, isGain ? styles.badgeGain : styles.badgeLoss]}>
          <Text style={[styles.badgeText, isGain ? styles.textGain : styles.textLoss]}>
            {isGain ? '▲' : '▼'} {Math.abs(card.priceChange24h).toFixed(1)}%
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  // ── Full card layout ──────────────────────────────────────────────────────
  const borderColor = RARITY_BORDER[tier];
  const glowColor   = RARITY_GLOW[tier];
  const badge       = RARITY_BADGE[tier];

  return (
    <TouchableOpacity
      style={[
        styles.card,
        tier !== 'standard' && {
          borderColor,
          shadowColor: borderColor,
          shadowOpacity: 0.35,
          shadowRadius: tier === 'legendary' ? 20 : 12,
        },
        isLegendary ? styles.cardLegendary,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Legendary shimmer stripe at top */}
      {isLegendary && <ShimmerBar tier={tier} color={borderColor} />}

      {/* Left element bar */}
      {!compact && (
        <View style={[styles.elementBar, { backgroundColor: elementColor }]} />
      )}

      {/* Card image */}
      <View style={styles.imageWrapper}>
        <Image source={{ uri: card.imageUrl }} style={styles.image} />

        {/* Rarity crown badge (top-right of image) */}
        {badge.label !== '' && (
          <View style={[styles.rarityBadge, { backgroundColor: borderColor }]}>
            <Text style={styles.rarityBadgeText}>{badge.emoji}</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{card.name}</Text>
          {(isLegendary || isShinyCard) && (
            <Text style={styles.crownText}>{isLegendary ? '👑' : '✨'}</Text>
          )}
        </View>
        <Text style={styles.set}>{card.set} · {card.number}</Text>

        <View style={styles.priceRow}>
          <Text style={[styles.price, tier !== 'standard' ? styles.priceGold]}>
            {formatPrice(card.price)}
          </Text>
          {isTopCard && <Text style={styles.trophyIcon}>🏆</Text>}
          <View style={[styles.badge, isGain ? styles.badgeGain : styles.badgeLoss]}>
            <Text style={[styles.badgeText, isGain ? styles.textGain : styles.textLoss]}>
              {isGain ? '▲' : '▼'} {Math.abs(card.priceChange24h).toFixed(1)}%
            </Text>
          </View>
        </View>

        <Text style={styles.listings}>
          {card.listingCount} 個掛牌 · {card.rarity}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Full card
  card: {
    backgroundColor: '#14142A',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#2A2A50',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  cardLegendary: {
    borderWidth: 1.5,
    shadowRadius: 24,
  },
  shimmerBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 2,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    zIndex: 2,
  },
  elementBar: { width: 3, borderTopLeftRadius: 16 },
  imageWrapper: { position: 'relative' },
  image: {
    width: 90, height: 125,
    backgroundColor: '#1C1C38',
  },
  rarityBadge: {
    position: 'absolute',
    top: 6, right: 6,
    width: 22, height: 22,
    borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4,
  },
  rarityBadgeText: { fontSize: 12 },
  info: {
    flex: 1, padding: 12, justifyContent: 'space-between',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { color: '#F0F0FF', fontSize: 15, fontWeight: '700', flex: 1 },
  crownText: { fontSize: 12 },
  set: { color: '#8888CC', fontSize: 11, marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  price: { color: '#F0F0FF', fontSize: 18, fontWeight: '700' },
  priceGold: { color: '#D4AF37' },
  trophyIcon: { fontSize: 14 },
  badge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  badgeGain: { backgroundColor: 'rgba(0,200,150,0.15)' },
  badgeLoss: { backgroundColor: 'rgba(255,64,96,0.15)' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  textGain: { color: '#00C896' },
  textLoss: { color: '#FF4060' },
  listings: { color: '#4A4A70', fontSize: 11, marginTop: 4 },

  // Compact card
  compactCard: {
    width: 120,
    backgroundColor: '#14142A',
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#2A2A50',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  compactCardLegendary: {
    borderWidth: 1.5,
    shadowRadius: 16,
  },
  crownBadge: {
    position: 'absolute',
    top: 4, right: 4,
    zIndex: 3,
    width: 20, height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  crownBadgeText: { fontSize: 12 },
  compactImage: {
    width: '100%', height: 100,
    backgroundColor: '#1C1C38',
  },
  compactName: {
    color: '#F0F0FF', fontSize: 11, fontWeight: '600',
    paddingHorizontal: 8, paddingTop: 6, minHeight: 28,
  },
  compactPrice: {
    color: '#F0F0FF', fontSize: 12, fontWeight: '700',
    paddingHorizontal: 8, paddingTop: 4,
  },
});

export default CardItem;
