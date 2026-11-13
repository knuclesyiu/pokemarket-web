/**
 * Seller responds to an offer (accept / reject / counter).
 *
 * When the seller ACCEPTS, the trade is actually executed:
 *   - the buyer's offered cards move to the seller's portfolio
 *   - the seller's listed card moves to the buyer's portfolio
 *   - the listing is marked sold
 *   - a trade record is written
 *
 * Portfolio entries live at `users/{uid}/portfolio/{cardId}` with the
 * shape { cardId, quantity, avgBuyPrice, addedAt }.
 */
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { decrementPortfolio, incrementPortfolio } from '../shared/portfolio';

const db = admin.firestore();

export const respondToOffer = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', '需要登入');
  const sellerId = request.auth.uid;
  const { offerId, action, counterData } = request.data as any;

  const offerRef = db.doc(`offers/${offerId}`);
  const snap = await offerRef.get();
  if (!snap.exists) throw new functions.HttpsError('not-found', '出價不存在');
  const offer = snap.data() as any;
  if (offer.sellerId !== sellerId) {
    throw new functions.HttpsError('permission-denied', '只有賣家可以回應');
  }
  if (offer.status !== 'pending' && offer.status !== 'countered') {
    throw new functions.HttpsError('failed-precondition', '此出價已結束');
  }

  if (action === 'counter') {
    if (!counterData) throw new functions.HttpsError('invalid-argument', 'counter 須提供 counterData');
    await offerRef.update({
      status: 'countered',
      counterOffer: counterData,
      respondedAt: FieldValue.serverTimestamp(),
      respondedAtMs: Date.now(),
    });
    return { offerId, newStatus: 'countered' };
  }

  if (action === 'reject') {
    await offerRef.update({
      status: 'rejected',
      respondedAt: FieldValue.serverTimestamp(),
      respondedAtMs: Date.now(),
    });
    return { offerId, newStatus: 'rejected' };
  }

  if (action !== 'accept') {
    throw new functions.HttpsError('invalid-argument', 'action 必須是 accept/reject/counter');
  }

  // ── Accept: execute the trade ────────────────────────────────────────
  const buyerId = offer.buyerId;

  const listingRef = db.doc(`listings/${offer.listingId}`);
  const listingSnap = await listingRef.get();
  if (!listingSnap.exists) {
    throw new functions.HttpsError('not-found', '掛牌不存在');
  }
  const listing = listingSnap.data() as any;
  if (listing.status !== 'active') {
    throw new functions.HttpsError('failed-precondition', '掛牌已經唔存在或者賣咗');
  }

  const listingCardId: string = listing.cardId;
  const offerCards: any[] = Array.isArray(offer.offerCards) ? offer.offerCards : [];

  // VERIFY BEFORE WRITING — if the buyer no longer holds the cards they
  // offered, the trade must not half-complete.
  const buyerCardIds = offerCards
    .map((oc) => oc?.card?.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  for (const cardId of buyerCardIds) {
    const ok = await decrementPortfolio(db, buyerId, cardId);
    if (!ok) {
      throw new functions.HttpsError(
        'failed-precondition',
        '買家嘅卡片唔存在或者數量不足，交易暫停',
      );
    }
  }

  // The seller gives up the listed card. If it is not in their
  // portfolio that is not fatal (the card may have been listed from
  // elsewhere), so we only log it.
  const sellerHadCard = await decrementPortfolio(db, sellerId, listingCardId);
  if (!sellerHadCard) {
    console.warn(
      `[respondToOffer] seller ${sellerId} had no portfolio entry for ${listingCardId}`,
    );
  }

  // The buyer receives the listed card.
  await incrementPortfolio(db, buyerId, listingCardId, {
    avgBuyPrice: Number(offer.cashAddHkd ?? 0) > 0 ? Number(offer.cashAddHkd) : Number(listing.price ?? 0),
    condition: listing.condition ?? 'Near Mint',
    source: 'trade',
  });

  // The seller receives the buyer's offered cards.
  for (const oc of offerCards) {
    const cardId = oc?.card?.id;
    if (!cardId) continue;
    await incrementPortfolio(db, sellerId, cardId, {
      avgBuyPrice: 0,
      condition: oc?.condition ?? 'Near Mint',
      source: 'trade',
    });
  }

  // Write the trade record.
  const tradeRef = db.collection('trades').doc();
  const now = Date.now();
  await tradeRef.set({
    id: tradeRef.id,
    offerId,
    listingId: offer.listingId,
    partyAId: sellerId,
    partyBId: buyerId,
    partyACards: [listing.card ?? { id: listingCardId, name: listing.cardName ?? '' }],
    partyBCards: offerCards,
    cashAtoBHkd: 0,
    cashBtoAHkd: Number(offer.cashAddHkd ?? 0),
    tradeType: 'offer_accepted',
    status: 'completed',
    completedAt: FieldValue.serverTimestamp(),
    completedAtMs: now,
    createdAt: FieldValue.serverTimestamp(),
    createdAtMs: now,
  });

  // Mark the listing sold.
  await listingRef.update({
    status: 'sold',
    soldAt: FieldValue.serverTimestamp(),
    soldAtMs: now,
    soldTo: buyerId,
    tradeId: tradeRef.id,
  });

  await offerRef.update({
    status: 'accepted',
    respondedAt: FieldValue.serverTimestamp(),
    respondedAtMs: now,
    tradeId: tradeRef.id,
  });

  return { offerId, newStatus: 'accepted', tradeId: tradeRef.id };
});
