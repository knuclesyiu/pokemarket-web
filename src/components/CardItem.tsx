import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { PokemonCard } from '../types';

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

const CardItem: React.FC<Props> = ({ card, onPress, compact }) => {
  const isGain = card.priceChange24h >= 0;

  if (compact) {
    return (
      <TouchableOpacity style={styles.compactCard} onPress={onPress} activeOpacity={0.7}>
        <Image source={{ uri: card.imageUrl }} style={styles.compactImage} />
        <Text style={styles.compactName} numberOfLines={1}>{card.name.replace(' VMAX', '\nVMAX')}</Text>
        <Text style={styles.compactPrice}>{formatPrice(card.price)}</Text>
        <View style={[styles.badge, isGain ? styles.badgeGain : styles.badgeLoss]}>
          <Text style={[styles.badgeText, isGain ? styles.textGain : styles.textLoss]}>
            {isGain ? '▲' : '▼'} {Math.abs(card.priceChange24h).toFixed(1)}%
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <Image source={{ uri: card.imageUrl }} style={styles.image} />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{card.name}</Text>
        <Text style={styles.set}>{card.set} · {card.number}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatPrice(card.price)}</Text>
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1E1E2E',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#2A2A3E',
  },
  image: {
    width: 90,
    height: 125,
    backgroundColor: '#2A2A3E',
  },
  info: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  name: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  set: {
    color: '#8888AA',
    fontSize: 11,
    marginTop: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  price: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeGain: { backgroundColor: 'rgba(0,200,100,0.15)' },
  badgeLoss: { backgroundColor: 'rgba(255,60,60,0.15)' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  textGain: { color: '#00C864' },
  textLoss: { color: '#FF3C3C' },
  listings: {
    color: '#6666AA',
    fontSize: 11,
    marginTop: 4,
  },
  // compact
  compactCard: {
    width: 120,
    backgroundColor: '#1E1E2E',
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#2A2A3E',
  },
  compactImage: {
    width: '100%',
    height: 100,
    backgroundColor: '#2A2A3E',
  },
  compactName: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingTop: 6,
    minHeight: 28,
  },
  compactPrice: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingTop: 4,
  },
});

export default CardItem;
