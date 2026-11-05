/**
 * Return the caller's own cards, so the "Make Offer" screen can offer
 * cards from their portfolio.
 *
 * The portfolio lives at `users/{uid}/portfolio/{cardId}` with the shape
 * { cardId, quantity, avgBuyPrice, addedAt }. The full card details are
 * NOT stored there — they are joined in from the `card_prices`
 * catalogue at read time, so a card's details stay in one place.
 */
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { loadCardCatalog, buildTradeCard, toMillis } from '../shared/cards';

const db = admin.firestore();

export const getUserCards = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', '需要登入');
  const uid = request.auth.uid;

  const snap = await db.collection(`users/${uid}/portfolio`).get();

  const entries = snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      id: d.id,
      cardId: data.cardId ?? d.id,
      quantity: Number(data.quantity ?? 1),
      avgBuyPrice: Number(data.avgBuyPrice ?? 0),
      addedAt: toMillis(data.addedAt),
      source: data.source ?? 'other',
      condition: data.condition ?? 'Near Mint',
      grade: data.grade,
      grading: data.grading,
      notes: data.notes,
    };
  });

  const catalog = await loadCardCatalog(entries.map((e) => e.cardId));

  const cards = entries.map((e) => ({
    id: e.id,
    cardId: e.cardId,
    card: buildTradeCard(e.cardId, catalog[e.cardId]),
    acquiredAt: e.addedAt,
    source: e.source,
    condition: e.condition,
    grade: e.grade,
    grading: e.grading,
    notes: e.notes,
    quantity: e.quantity,
    avgBuyPrice: e.avgBuyPrice,
  }));

  cards.sort((a, b) => b.acquiredAt - a.acquiredAt);

  return { cards, total: cards.length };
});
