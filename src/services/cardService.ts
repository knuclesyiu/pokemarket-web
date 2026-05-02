// src/services/cardService.ts

import { Card } from '../types';
import { TCGDEX_API, TCGDEX_LOCALE } from '../config/platform';

const API_BASE = `${TCGDEX_API}/${TCGDEX_LOCALE}`;

// Search cards by name using TCGdex v2 API
export const searchCards = async (query: string): Promise<Card[]> => {
  if (!query || query.trim().length < 2) return [];

  try {
    const response = await fetch(`${API_BASE}/cards?q=${encodeURIComponent(query)}&limit=20`);
    if (!response.ok) return [];

    const data = await response.json();
    if (!data || !Array.isArray(data)) return [];

    return data.map((card: any): Card => ({
      id: card.id,
      name: card.name,
      set: card.set?.name || 'Unknown',
      setCode: card.set?.id || '',
      rarity: card.rarity || 'Unknown',
      images: { small: card.image || '', large: card.image || '' },
      price: card.price?.hk ? {
        low: card.price.hk.low,
        mid: card.price.hk.mid,
        high: card.price.hk.high,
        market: card.price.hk.mid,
        currency: 'HKD',
      } : undefined,
    }));
  } catch (error) {
    console.error('searchCards error:', error);
    return [];
  }
};

// Get trending cards
export const getTrendingCards = async (limit: number = 20): Promise<Card[]> => {
  try {
    // TCGdex v2 - get Base Set cards as trending
    const response = await fetch(`${API_BASE}/sets/base1/cards?limit=${limit}`);
    if (!response.ok) return [];

    const data = await response.json();
    if (!data?.cards) return [];

    return data.cards.map((card: any): Card => ({
      id: card.id,
      name: card.name,
      set: card.set?.name || 'Base Set',
      setCode: 'base1',
      rarity: card.rarity || 'Unknown',
      images: { small: card.image || '', large: card.image || '' },
      price: card.price?.hk ? {
        low: card.price.hk.low,
        mid: card.price.hk.mid,
        high: card.price.hk.high,
        market: card.price.hk.mid,
        currency: 'HKD',
      } : undefined,
    }));
  } catch (error) {
    console.error('getTrendingCards error:', error);
    return [];
  }
};

// Get card by ID
export const getCardById = async (cardId: string): Promise<Card | null> => {
  try {
    const response = await fetch(`${API_BASE}/cards/${cardId}`);
    if (!response.ok) return null;

    const card = await response.json();
    return {
      id: card.id,
      name: card.name,
      set: card.set?.name || 'Unknown',
      setCode: card.set?.id || '',
      rarity: card.rarity || 'Unknown',
      images: { small: card.image || '', large: card.image || '' },
      price: card.price?.hk ? {
        low: card.price.hk.low,
        mid: card.price.hk.mid,
        high: card.price.hk.high,
        market: card.price.hk.mid,
        currency: 'HKD',
      } : undefined,
    };
  } catch (error) {
    console.error('getCardById error:', error);
    return null;
  }
};
