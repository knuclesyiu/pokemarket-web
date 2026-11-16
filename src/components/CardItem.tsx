import { t } from '../i18n';
import React, { useEffect, useRef } from 'react';
import {
  View, Text, Image, StyleSheet, TouchableOpacity, Animated,
} from 'react-native';
import { PokemonCard } from '../types';
import { C, R, SP, T, themed } from '../theme';

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
  standard:   C.border,
  holo:       C.gold,
  ultra:      C.gold,
  legendary:  C.gold,
};

const RARITY_GLOW: Record<RarityTier, string> = {
  standard:   'transparent',
  holo:       'rgba(212,175,55,0.15)',
  ultra:      'rgba(212,175,55,0.25)',
  legendary:  'rgba(212,175,55,0.4)',
};

/**
 * The rarity tag.
 *
 * It used to be an emoji in a coloured circle — a crown, a star, a
 * sparkle — which meant the meaning had to be guessed from the shape
 * and the ring around it did not say anything. A written tag says
 * what it is, and it survives being read by someone who has never
 * seen the app.
 */
const RARITY_TAG: Record<RarityTier, { label: string; color: string }> = {
  standard:   { label: '', color: C.textTertiary },
  holo:       { label: 'HOLO', color: C.gold },
  ultra:      { label: 'ULTRA', color: C.gold },
  legendary:  { label: 'LEGEND', color: C.gold },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * The price, split so the currency does not compete with the number.
 *
 * A buyer scanning a list of cards reads the digits first; `HK$` in
 * the same weight as `4,900` makes the line twice as wide and the
 * number half as legible. The number also uses tabular figures, so a
 * column of prices lines up on the decimal point.
 */
const formatPrice = (price: number): { currency: string; value: string } => {
  const rounded = Math.round(price);
  if (rounded >= 1000000) {
    return { currency: 'HK$', value: `${(rounded / 1000000).toFixed(2)}M` };
  }
  if (rounded >= 10000) {
    return { currency: 'HK$', value: `${(rounded / 1000).toFixed(1)}K` };
  }
  return {
    currency: 'HK$',
    value: rounded.toLocaleString('en-US', {
      minimumFractionDigits: rounded < 100 ? 2 : 0,
      maximumFractionDigits: 2,
    }),
  };
};

const ELEMENT_COLORS: Record<string, string> = {
  fire: C.warn, water: '#4A90D9', grass: '#52C41A',
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

  const price = formatPrice(card.price);
  const tag  = RARITY_TAG[tier];

  // ── Compact layout ─────────────────────────────────────────────────────────
  if (compact) {
    const borderColor = RARITY_BORDER[tier];
    const glowColor  = RARITY_GLOW[tier];

    return (
      <TouchableOpacity
        style={[
          styles.compactCard,
          isLegendary ? styles.compactCardLegendary : null,
          { borderColor, shadowColor: borderColor },
          glowColor !== 'transparent' && { shadowColor: borderColor, shadowOpacity: 0.4 },
        ]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        {isLegendary && <ShimmerBar tier={tier} color={borderColor} />}

        {/* Shiny / Legendary tag */}
        {(isLegendary || isShinyCard) && (
          <View style={styles.crownBadge}>
            <Text style={styles.crownBadgeText}>
              {isLegendary ? 'LEGEND' : 'SHINY'}
            </Text>
          </View>
        )}

        <Image source={{ uri: card.imageUrl }} style={styles.compactImage} />
        <Text style={styles.compactName} numberOfLines={1}>
          {card.name.replace(' VMAX', '\nVMAX')}
        </Text>
        <View style={styles.compactPriceRow}>
          <Text style={styles.compactCurrency}>{price.currency}</Text>
          <Text style={[styles.compactPrice, tier !== 'standard' ? styles.priceGold : null]}>
            {price.value}
          </Text>
        </View>
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
        isLegendary ? styles.cardLegendary : null,
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

        {/* Rarity tag (top-right of image) */}
        {tag.label !== '' && (
          <View style={styles.rarityBadge}>
            <Text style={[styles.rarityBadgeText, { color: tag.color }]}>
              {tag.label}
            </Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{card.name}</Text>
          {isShinyCard && !isLegendary && (
            <Text style={styles.shinyTag}>SHINY</Text>
          )}
        </View>
        <Text style={styles.set} numberOfLines={1}>{card.set} · {card.number}</Text>

        <View style={styles.priceRow}>
          <Text style={styles.priceCurrency}>{price.currency}</Text>
          <Text style={[styles.price, tier !== 'standard' ? styles.priceGold : null]}>
            {price.value}
          </Text>
          {isTopCard && (
            <View style={styles.trophyTag}>
              <Text style={styles.trophyTagText}>HOT</Text>
            </View>
          )}
          <View style={[styles.badge, isGain ? styles.badgeGain : styles.badgeLoss]}>
            <Text style={[styles.badgeText, isGain ? styles.textGain : styles.textLoss]}>
              {isGain ? '▲' : '▼'} {Math.abs(card.priceChange24h).toFixed(1)}%
            </Text>
          </View>
        </View>

        <Text style={styles.listings} numberOfLines={1}>
          {t('{p0} 個掛牌 · {p1}', { p0: card.listingCount, p1: card.rarity })}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = themed((C) => StyleSheet.create({
  // Full card
  card: {
    backgroundColor: C.card,
    borderRadius: R.lg,
    overflow: 'hidden',
    marginBottom: SP.md,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: C.border,
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
    borderTopLeftRadius: R.lg,
    borderTopRightRadius: R.lg,
    zIndex: 2,
  },
  elementBar: { width: 3, borderTopLeftRadius: R.lg },
  imageWrapper: { position: 'relative' },
  image: {
    width: 90, height: 125,
    backgroundColor: C.elevated,
  },
  rarityBadge: {
    position: 'absolute',
    top: 6, right: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: R.sm,
    backgroundColor: 'rgba(8,8,16,0.72)',
    borderWidth: 1,
    borderColor: C.goldEdge,
  },
  rarityBadgeText: {
    ...T.overline,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  info: {
    flex: 1, padding: SP.md, justifyContent: 'space-between',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { ...T.bodyStrong, color: C.text, flex: 1 },
  shinyTag: {
    ...T.overline,
    fontSize: 9,
    color: C.gold,
    borderWidth: 1,
    borderColor: C.goldEdge,
    borderRadius: R.sm,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  set: { ...T.caption, color: C.textTertiary, marginTop: 2 },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginTop: SP.sm,
  },
  priceCurrency: {
    ...T.caption,
    color: C.textTertiary,
    marginRight: 1,
  },
  price: { ...T.price, color: C.text },
  priceGold: { color: C.gold },
  trophyTag: {
    borderWidth: 1,
    borderColor: C.action,
    borderRadius: R.sm,
    paddingHorizontal: 4,
    paddingVertical: 1,
    alignSelf: 'flex-start',
  },
  trophyTagText: { ...T.overline, fontSize: 9, color: C.action },
  badge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: R.sm },
  badgeGain: { backgroundColor: 'rgba(61,214,140,0.14)' },
  badgeLoss: { backgroundColor: 'rgba(255,107,107,0.14)' },
  badgeText: { ...T.caption, fontSize: 11 },
  textGain: { color: C.up },
  textLoss: { color: C.down },
  listings: { ...T.caption, color: C.textDisabled, marginTop: SP.xs },

  // Compact card
  compactCard: {
    width: 124,
    backgroundColor: C.card,
    borderRadius: R.md,
    overflow: 'hidden',
    marginRight: SP.md,
    borderWidth: 1,
    borderColor: C.border,
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
    top: 4, left: 4,
    zIndex: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: R.sm,
    backgroundColor: 'rgba(8,8,16,0.75)',
    borderWidth: 1,
    borderColor: C.goldEdge,
  },
  crownBadgeText: { ...T.overline, fontSize: 8, color: C.gold, letterSpacing: 0.6 },
  compactImage: {
    width: '100%', height: 100,
    backgroundColor: C.elevated,
  },
  compactName: {
    ...T.caption,
    color: C.text,
    paddingHorizontal: SP.sm,
    paddingTop: 6,
    minHeight: 28,
  },
  compactPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
    paddingHorizontal: SP.sm,
    paddingTop: 4,
  },
  compactCurrency: { ...T.overline, fontSize: 9, color: C.textTertiary },
  compactPrice: { ...T.price, fontSize: 13, color: C.text },
}))

export default CardItem;
