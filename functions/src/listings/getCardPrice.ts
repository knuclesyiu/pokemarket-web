/**
 * Get single card price snapshot.
 */
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export const getCardPrice = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', '需要登入');
  const { cardId } = request.data as { cardId: string };
  if (!cardId) throw new functions.HttpsError('invalid-argument', 'cardId 必填');

  const snap = await db.doc(`card_prices/${cardId}`).get();
  if (!snap.exists) return { priceHkd: 0, change24h: 0, source: 'none' };
  const d = snap.data() ?? {};
  return {
    priceHkd: d.priceHkd ?? 0,
    change24h: d.change24hPct ?? 0,
    source: d.source ?? 'cache',
    fetchedAt: d.fetchedAtTs ?? 0,
  };
});
