/**
 * PokeMarket — Wallet Service
 *
 * Reads the user's wallet (balance, pending escrow) and transaction
 * history from Firestore. Falls back to a real onSnapshot so the user
 * sees live updates as orders change status.
 *
 * Schema:
 *   users/{uid}/
 *     wallet/main  → { balance: number, pendingEscrow: number,
 *                      onboardingComplete: boolean, updatedAt: ts }
 *     transactions/{txId} → { type: 'buy'|'sell', cardName, cardImage,
 *                              counterparty, amount, state, createdAt,
 *                              autoReleaseAt? }
 *
 * Real values come from the backend (Cloud Functions update the
 * wallet subcollection when Stripe webhooks fire).
 */

import { t } from '../i18n';
import {
  doc, onSnapshot, collection, query, orderBy, limit, getDoc,
} from 'firebase/firestore';
import { db } from './firebase';

export interface WalletState {
  balance: number;        // HK$ available for withdrawal
  pendingEscrow: number;  // HK$ locked in escrow (buyer-paid, not yet released)
  onboardingComplete: boolean;
  updatedAt?: number;
}

export type WalletTxState = 'pending' | 'in_escrow' | 'released' | 'disputed' | 'refunded';

export interface WalletTransaction {
  id: string;
  type: 'buy' | 'sell';
  cardName: string;
  cardImage?: string;
  counterparty: string;
  amount: number;
  state: WalletTxState;
  createdAt: number;       // unix ms
  autoReleaseAt?: number;  // unix ms
}

/** Subscribe to wallet balance. Returns unsubscribe. */
export function subscribeWallet(
  uid: string,
  onUpdate: (w: WalletState) => void,
  onError?: (e: Error) => void,
): () => void {
  return onSnapshot(
    doc(db, 'users', uid, 'wallet', 'main'),
    snap => {
      if (!snap.exists()) {
        // First-time user: empty wallet
        onUpdate({ balance: 0, pendingEscrow: 0, onboardingComplete: false });
        return;
      }
      const d = snap.data() as any;
      onUpdate({
        balance: Number(d.balance ?? 0),
        pendingEscrow: Number(d.pendingEscrow ?? 0),
        onboardingComplete: Boolean(d.onboardingComplete ?? false),
        updatedAt: Number(d.updatedAt ?? 0),
      });
    },
    err => onError?.(err),
  );
}

/** Subscribe to transaction history (newest first). Returns unsubscribe. */
export function subscribeTransactions(
  uid: string,
  onUpdate: (txs: WalletTransaction[]) => void,
  onError?: (e: Error) => void,
  maxResults = 50,
): () => void {
  return onSnapshot(
    query(
      collection(db, 'users', uid, 'transactions'),
      orderBy('createdAt', 'desc'),
      limit(maxResults),
    ),
    snap => {
      onUpdate(snap.docs.map(d => {
        const data = d.data() as any;
        return {
          id: d.id,
          type: data.type ?? 'buy',
          cardName: data.cardName ?? t('(未知卡牌)'),
          cardImage: data.cardImage,
          counterparty: data.counterparty ?? t('(未知用戶)'),
          amount: Number(data.amount ?? 0),
          state: (data.state ?? 'pending') as WalletTxState,
          createdAt: Number(data.createdAt ?? 0),
          autoReleaseAt: data.autoReleaseAt ? Number(data.autoReleaseAt) : undefined,
        };
      }));
    },
    err => onError?.(err),
  );
}

/** One-shot fetch (no subscription). For initial load before sub starts. */
export async function getWallet(uid: string): Promise<WalletState> {
  const snap = await getDoc(doc(db, 'users', uid, 'wallet', 'main'));
  if (!snap.exists()) return { balance: 0, pendingEscrow: 0, onboardingComplete: false };
  const d = snap.data() as any;
  return {
    balance: Number(d.balance ?? 0),
    pendingEscrow: Number(d.pendingEscrow ?? 0),
    onboardingComplete: Boolean(d.onboardingComplete ?? false),
    updatedAt: Number(d.updatedAt ?? 0),
  };
}
