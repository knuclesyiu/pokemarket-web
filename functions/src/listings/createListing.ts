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
  const { cardId, cardName, price, condition, type, grade, grading: gradingInput, imageUrl } = request.data as any;
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

  // The grade is part of what the buyer is paying for, so the server
  // checks it rather than taking the client's word: the grade has to
  // be one we know, and the certification number has to look like a
  // certification number.
  let grading = null;
  if (gradingInput && typeof gradingInput === 'object') {
    const g = gradingInput as Record<string, any>;
    const ALLOWED = new Set([
      'raw', 'psa10', 'psa95', 'psa9', 'psa8', 'psa7',
      'bgs10', 'bgs95', 'bgs9', 'bgs8',
      'cgc10', 'cgc95', 'cgc9', 'other_graded',
    ]);
    if (!ALLOWED.has(g.grade)) {
      throw new functions.HttpsError('invalid-argument', '認證分數唔啱');
    }
    if (g.grade !== 'raw') {
      const grader = String(g.grader ?? '').toUpperCase();
      if (!['PSA', 'BGS', 'CGC', 'OTHER'].includes(grader)) {
        throw new functions.HttpsError('invalid-argument', '認證機構唔啱');
      }
      const cert = g.certNumber ? String(g.certNumber).trim().slice(0, 32) : undefined;
      if (cert) {
        const digits = /^\d{6,12}$/.test(cert);
        const alnum = /^[A-Z0-9]{8,12}$/i.test(cert);
        if (!digits && !alnum) {
          throw new functions.HttpsError('invalid-argument', '認證編號格式唔啱');
        }
      }
      grading = {
        grade: g.grade,
        grader: grader === 'OTHER' ? 'Other' : grader,
        certNumber: cert || undefined,
        gradeValue: typeof g.gradeValue === 'number' ? g.gradeValue : undefined,
      };
    }
  }

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
    grading,                    // validated above: {grade, grader, certNumber, gradeValue}
    status: 'active',
    createdAt: FieldValue.serverTimestamp(),
    createdAtMs: now,
  });
  return { listingId: listingRef.id, status: 'active' };
});
