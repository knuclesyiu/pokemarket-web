/**
 * Create a trade offer on a listing.
 * Validates: buyer != seller, listing active, listing price valid.
 */
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export const createOffer = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', '需要登入');
  const buyerId = request.auth.uid;
  const { listingId, offerCards, cashAddHkd, message } = request.data as any;

  const listingSnap = await db.doc(`listings/${listingId}`).get();
  if (!listingSnap.exists) {
    throw new functions.HttpsError('not-found', '掛牌不存在');
  }
  const listing = listingSnap.data() as any;
  if (listing.status !== 'active') {
    throw new functions.HttpsError('failed-precondition', '掛牌已下架');
  }
  if (listing.sellerId === buyerId) {
    throw new functions.HttpsError('failed-precondition', '不能對自己嘅掛牌出價');
  }

  // Display names — Firebase tokens carry no `name` claim for
  // email/password users, so read them from the profiles.
  const [buyerProfile, sellerProfile] = await Promise.all([
    db.doc(`users/${buyerId}`).get(),
    db.doc(`users/${listing.sellerId}`).get(),
  ]);
  const buyerName = (buyerProfile.data()?.displayName as string) ?? '';
  const sellerName = (sellerProfile.data()?.displayName as string) ?? '';

  const offerRef = db.collection('offers').doc();
  const now = Date.now();
  await offerRef.set({
    id: offerRef.id,
    listingId,
    buyerId,
    sellerId: listing.sellerId,
    buyerName,
    sellerName,
    // Full nested card object — the client's Offer type expects TradeCard
    targetCard: listing.card ?? {
      id: listing.cardId,
      name: listing.cardName ?? '',
      imageUrl: listing.imageUrl ?? '',
    },
    targetPrice: listing.price,
    offerCards: offerCards ?? [],
    cashAddHkd: cashAddHkd ?? 0,
    message: message ?? '',
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAtMs: now,
  });
  return { offerId: offerRef.id, status: 'pending' };
});
