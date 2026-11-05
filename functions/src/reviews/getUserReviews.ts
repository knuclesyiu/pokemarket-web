/**
 * List the reviews a user has received (their public reputation).
 */
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { toMillis } from '../shared/cards';

const db = admin.firestore();

export const getUserReviews = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', '需要登入');

  const { uid, limit } = request.data as { uid?: string; limit?: number };
  if (!uid) {
    throw new functions.HttpsError('invalid-argument', '缺少 uid');
  }

  const cap = Math.min(limit ?? 20, 50);

  const snap = await db
    .collection('reviews')
    .where('revieweeId', '==', uid)
    .limit(cap)
    .get();

  const reviews = snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      id: d.id,
      reviewerId: data.reviewerId ?? '',
      revieweeId: data.revieweeId ?? uid,
      comment: data.comment ?? '',
      type: data.type ?? 'positive',
      createdAt: toMillis(data.createdAt),
    };
  });

  return { reviews, total: reviews.length };
});
