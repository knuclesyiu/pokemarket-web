/**
 * Create a new market listing (sell-side).
 * Validates: seller is signed in, card exists, price > 0.
 * Writes listings/{listingId} + denormalizes a few fields for fast list query.
 */
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export const createListing = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', '需要登入');
  const { cardId, cardName, price, condition, type, grade, grading, imageUrl } = request.data as any;
  if (!cardId || !price || price <= 0) {
    throw new functions.HttpsError('invalid-argument', 'cardId 與 price 為必填');
  }
  if (price > 10_000_000) {
    throw new functions.HttpsError('invalid-argument', '掛牌價超出上限 HK$ 10M');
  }

  const listingRef = db.collection('listings').doc();
  await listingRef.set({
    id: listingRef.id,
    cardId,
    cardName: cardName ?? '',
    imageUrl: imageUrl ?? '',
    sellerId: request.auth.uid,
    sellerName: request.auth.token.name ?? '',
    price,
    condition: condition ?? 'Near Mint',
    type: type ?? 'buy_now',
    grade,           // legacy
    grading,         // new structured {grade, grader, certNumber, gradeValue}
    status: 'active',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { listingId: listingRef.id, status: 'active' };
});
