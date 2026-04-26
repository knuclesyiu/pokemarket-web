/**
 * User Types — PokeMarket
 */

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  phone: string;
  photoUrl?: string;
  memberSince: number; // timestamp
  lastLogin: number;   // timestamp
  isSeller: boolean;
  isBuyer: boolean;
  // Rating
  positiveReviews: number;
  negativeReviews: number;
  // Preferences
  language: 'zh-HK' | 'zh-CN' | 'en';
  notificationsEnabled: boolean;
  // Security
  transactionPinHash?: string; // SHA-256 hash of user's transaction PIN
}

export interface Review {
  id: string;
  oderId: string;
  reviewerId: string;
  revieweeId: string;
  type: 'positive' | 'negative';
  createdAt: number;
  orderId: string;
  cardName?: string;
  comment?: string;
}
