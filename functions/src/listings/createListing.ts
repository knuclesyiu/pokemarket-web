/**
 * Create a new market listing (sell-side).
 * Validates: seller is signed in, card exists, price > 0.
 * Writes listings/{listingId} with a denormalized `card` object so the
 * client can render the listing without a second lookup.
 */
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { loadCardCatalog, buildTradeCard } from '../shared/cards';

const db = admin.firestore();

export const createListing = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', '需要登入');
  const sellerId = request.auth.uid;
  const { cardId, cardName, price, condition, type, grade, grading, imageUrl } = request.data as any;
  if (!cardId || !price || price <= 0) {
    throw new functions.HttpsError('invalid-argument', 'cardId 與 price 為必填');
  }
  if (price > 10_000_000) {
    throw new functions.HttpsError('invalid-argument', '掛牌價超出上限 HK$ 10M');
  }

  // The seller's display name — Firebase tokens carry no `name` claim
  // for email/password users, so read it from their profile.
  const profileSnap = await db.doc(`users/${sellerId}`).get();
  const sellerName = (profileSnap.data()?.displayName as string) ?? '';

  // Build the nested card object from the catalogue. The client sends
  // only a cardId, so the details are looked up server-side.
  const catalog = await loadCardCatalog([cardId]);
  const priceDoc = catalog[cardId];
  const card = buildTradeCard(cardId, priceDoc ?? {});
  if (cardName) card.name = cardName;
  if (imageUrl) card.imageUrl = imageUrl;
  if (condition) card.condition = condition;

  const listingRef = db.collection('listings').doc();
  const now = Date.now();
  await listingRef.set({
    id: listingRef.id,
    cardId,
    cardName: card.name,
    imageUrl: card.imageUrl,
    card,                       // nested object the client's MarketListing expects
    sellerId,
    sellerName,
    price,
    condition: condition ?? 'Near Mint',
    type: type ?? 'buy_now',
    grade,                      // legacy
    grading,                    // new structured {grade, grader, certNumber, gradeValue}
    status: 'active',
    createdAt: FieldValue.serverTimestamp(),
    createdAtMs: now,
  });
  return { listingId: listingRef.id, status: 'active' };
});
