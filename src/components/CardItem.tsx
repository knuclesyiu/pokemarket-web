import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { PokemonCard } from '../types';

// NEW: Obsidian Gallery — design constants
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

interface Props {
  card: PokemonCard;
  onPress?: () => void;
  compact?: boolean;
}

const formatPrice = (price: number): string => {
  if (price >= 1000000) return `HK$ ${(price / 1000000).toFixed(1)}M`;
  if (price >= 1000) return `HK$ ${(price / 1000).toFixed(1)}K`;
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
const getElementColor = (name: string) => {
  const key = name.split(' ')[0];
  return ELEMENT_COLORS[ELEMENT_MAP[key] ?? 'normal'] ?? '#8C8C8C';
};

const CardItem: React.FC<Props> = ({ card, onPress, compact }) => {
  const isGain = card.priceChange24h >= 0;
  const elementColor = getElementColor(card.name);
  const isTopCard = card.priceChange24h >= 8;

  if (compact) {
    return (
      <TouchableOpacity style={styles.compactCard} onPress={onPress} activeOpacity={0.7}>
        <Image source={{ uri: card.imageUrl }} style={styles.compactImage} />
        <Text style={styles.compactName} numberOfLines={1}>{card.name.replace(' VMAX', '\nVMAX')}</Text>
        <Text style={styles.compactPriceGold}>{formatPrice(card.price)}</Text>
        <View style={[styles.badge, isGain ? styles.badgeGain : styles.badgeLoss]}>
          <Text style={[styles.badgeText, isGain ? styles.textGain : styles.textLoss]}>
            {isGain ? '▲' : '▼'} {Math.abs(card.priceChange24h).toFixed(1)}%
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.card, !compact && { borderLeftWidth: 3, borderLeftColor: elementColor }]}
      onPress={onPress} activeOpacity={0.7}
    >
      {!compact && <View style={[styles.elementBar, { backgroundColor: elementColor }]} />}
      <Image source={{ uri: card.imageUrl }} style={styles.image} />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{card.name}</Text>
        <Text style={styles.set}>{card.set} · {card.number}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.priceGold}>{formatPrice(card.price)}</Text>
          {isTopCard && <Text style={styles.trophyIcon}>🏆</Text>}
          <View style={[styles.badge, isGain ? styles.badgeGain : styles.badgeLoss]}>
            <Text style={[styles.badgeText, isGain ? styles.textGain : styles.textLoss]}>
              {isGain ? '▲' : '▼'} {Math.abs(card.priceChange24h).toFixed(1)}%
            </Text>
          </View>
        </View>
        <Text style={styles.listings}>{card.listingCount} 個掛牌</Text>
      </View>
    </TouchableOpacity>
  );
};

// NEW: Obsidian Gallery design system
const styles = StyleSheet.create({
  // Elevated card with shadow and gold price
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
  image: {
    width: 90,
    height: 125,
    backgroundColor: '#1C1C38',
  },
  info: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  name: {
    color: '#F0F0FF',
    fontSize: 15,
    fontWeight: '700',
  },
  set: {
    color: '#8888CC',
    fontSize: 11,
    marginTop: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  // NEW: gold price for primary accent
  priceGold: {
    color: '#D4AF37',
    fontSize: 18,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeGain: { backgroundColor: 'rgba(0,200,150,0.15)' },   // jade tint
  badgeLoss: { backgroundColor: 'rgba(255,64,96,0.15)' },  // ruby tint
  badgeText: { fontSize: 11, fontWeight: '700' },
  textGain: { color: '#00C896' },   // jade
  textLoss: { color: '#FF4060' },  // ruby
  elementBar: { width: 3 },
  listings: {
    color: '#8888CC',
    fontSize: 11,
    marginTop: 4,
  },
  trophyIcon: { fontSize: 14 },
  // Compact card — elevated with gold price
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
    shadowRadius: 10,
    elevation: 5,
  },
  compactImage: {
    width: '100%',
    height: 100,
    backgroundColor: '#1C1C38',
  },
  compactName: {
    color: '#F0F0FF',
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingTop: 6,
    minHeight: 28,
  },
  compactPriceGold: {
    color: '#D4AF37',   // gold for compact price
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingTop: 4,
  },
});

export default CardItem;