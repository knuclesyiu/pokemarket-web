// src/services/cardService.ts

import { Card } from '../types';
import { TCGDEX_API, TCGDEX_LOCALE } from '../config/platform';
import { MOCK_CARDS, MOCK_TRENDING_CARDS } from '../data/mockData';

const API_BASE = `${TCGDEX_API}/${TCGDEX_LOCALE}`;

// Fallback mock data
const useMockData = async <T>(apiCall: () => Promise<T>, mockData: T): Promise<T> => {
  try {
    const result = await apiCall();
    // If result is empty array or null, use mock
    if (Array.isArray(result) && result.length === 0) {
      console.log('[cardService] API returned empty, using mock data');
      return mockData;
    }
    if (!result) {
      console.log('[cardService] API returned null, using mock data');
      return mockData;
    }
    return result;
  } catch (error) {
    console.log('[cardService] API error, using mock data:', error);
    return mockData;
  }
};

// Search cards by name using TCGdex v2 API
export const searchCards = async (query: string): Promise<Card[]> => {
  if (!query || query.trim().length < 2) return [];

  // Use mock data for now (TCGdex API may not be accessible)
  return useMockData(async () => {
    try {
      // TCGdex v2 search endpoint
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
  }, MOCK_CARDS);
};

// Get trending cards
export const getTrendingCards = async (limit: number = 20): Promise<Card[]> => {
  // Use mock data for now (TCGdex API may not be accessible)
  return useMockData(async () => {
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
  }, MOCK_TRENDING_CARDS);
};

// Get card by ID
export const getCardById = async (cardId: string): Promise<Card | null> => {
  // Try mock first, then API
  const mockCard = MOCK_CARDS.find(c => c.id === cardId);
  if (mockCard) return mockCard;

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