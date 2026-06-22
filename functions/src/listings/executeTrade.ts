/**
 * Execute a direct trade (no offer negotiation).
 * Both users confirm and cards swap instantly.
 */
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

const db = admin.firestore();

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

  // For MVP: just log the trade; do not actually move cards between
  // portfolios — that requires portfolio verification + card transfer
  // logic that needs to be implemented in a follow-up sprint.
  const tradeRef = db.collection('trades').doc();
  await tradeRef.set({
    id: tradeRef.id,
    partyAId: uid,
    partyBId: targetUserId,
    partyACards: myCardIds,
    partyBCards: theirCardIds,
    cashAtoBHkd: cashToThemHkd ?? 0,
    cashBtoAHkd: 0,
    message: message ?? '',
    status: 'completed',
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { tradeId: tradeRef.id, status: 'completed' };
});
