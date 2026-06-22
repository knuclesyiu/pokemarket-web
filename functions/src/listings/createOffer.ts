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

  const offerRef = db.collection('offers').doc();
  await offerRef.set({
    id: offerRef.id,
    listingId,
    buyerId,
    sellerId: listing.sellerId,
    targetCard: { id: listing.cardId, name: listing.cardName, imageUrl: listing.imageUrl },
    targetPrice: listing.price,
    offerCards: offerCards ?? [],
    cashAddHkd: cashAddHkd ?? 0,
    message: message ?? '',
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { offerId: offerRef.id, status: 'pending' };
});
