/**
 * Execute a direct trade (no offer negotiation).
 * Both users confirm and cards swap instantly.
 *
 * The cards are actually moved between the two portfolios:
 * `users/{uid}/portfolio/{cardId}` with
 * { cardId, quantity, avgBuyPrice, addedAt }.
 */
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { FieldValue } from 'firebase-admin/firestore';
const db = admin.firestore();

async function decrementPortfolio(uid: string, cardId: string): Promise<boolean> {
  const ref = db.doc(`users/${uid}/portfolio/${cardId}`);
  const snap = await ref.get();
  if (!snap.exists) return false;
  const qty = Number(snap.data()?.quantity ?? 0);
  if (qty < 1) return false;
  if (qty === 1) {
    await ref.delete();
  } else {
    await ref.update({ quantity: qty - 1 });
  }
  return true;
}

async function incrementPortfolio(uid: string, cardId: string, avgBuyPrice: number) {
  const ref = db.doc(`users/${uid}/portfolio/${cardId}`);
  const snap = await ref.get();
  if (snap.exists) {
    await ref.update({
      quantity: FieldValue.increment(1),
      addedAt: Date.now(),
    });
  } else {
    await ref.set({
      cardId,
      quantity: 1,
      avgBuyPrice,
      condition: 'Near Mint',
      source: 'trade',
      addedAt: Date.now(),
    });
  }
}

export const executeTrade = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', '需要登入');
  const uid = request.auth.uid;
  const { targetUserId, myCardIds, theirCardIds, cashToThemHkd, message } = request.data as any;
  if (!targetUserId || !myCardIds?.length || !theirCardIds?.length) {
    throw new functions.HttpsError('invalid-argument', '缺交易對手 / 卡片');
  }
  if (targetUserId === uid) {
    throw new functions.HttpsError('failed-precondition', '不能同自己交易');
  }

  // Verify both sides still hold their cards BEFORE moving anything, so
  // the trade cannot half-complete.
  for (const cardId of myCardIds) {
    const ok = await decrementPortfolio(uid, cardId);
    if (!ok) {
      throw new functions.HttpsError('failed-precondition', '你嘅卡片唔存在或者數量不足，交易暫停');
    }
  }
  for (const cardId of theirCardIds) {
    const ok = await decrementPortfolio(targetUserId, cardId);
    if (!ok) {
      throw new functions.HttpsError('failed-precondition', '對方嘅卡片唔存在或者數量不足，交易暫停');
    }
  }

  // Swap them over.
  for (const cardId of theirCardIds) {
    await incrementPortfolio(uid, cardId, 0);
  }
  for (const cardId of myCardIds) {
    await incrementPortfolio(targetUserId, cardId, 0);
  }

  const tradeRef = db.collection('trades').doc();
  const now = Date.now();
  await tradeRef.set({
    id: tradeRef.id,
    partyAId: uid,
    partyBId: targetUserId,
    partyACards: myCardIds,
    partyBCards: theirCardIds,
    cashAtoBHkd: cashToThemHkd ?? 0,
    cashBtoAHkd: 0,
    message: message ?? '',
    tradeType: 'direct_trade',
    status: 'completed',
    completedAt: FieldValue.serverTimestamp(),
    completedAtMs: now,
    createdAt: FieldValue.serverTimestamp(),
    createdAtMs: now,
  });

  return { tradeId: tradeRef.id, status: 'completed' };
});
