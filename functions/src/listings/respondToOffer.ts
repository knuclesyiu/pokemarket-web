/**
 * Seller responds to an offer (accept / reject / counter).
 */
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

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

  let newStatus: string;
  if (action === 'accept') newStatus = 'accepted';
  else if (action === 'reject') newStatus = 'rejected';
  else if (action === 'counter') {
    newStatus = 'countered';
    if (!counterData) throw new functions.HttpsError('invalid-argument', 'counter 須提供 counterData');
  } else {
    throw new functions.HttpsError('invalid-argument', 'action 必須是 accept/reject/counter');
  }

  await offerRef.update({
    status: newStatus,
    counterOffer: action === 'counter' ? counterData : offer.counterOffer ?? null,
    respondedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { offerId, newStatus };
});
