/**
 * List the caller's notifications, newest first.
 */
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { toMillis } from '../shared/cards';

const db = admin.firestore();

export const getNotifications = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', '需要登入');
  const uid = request.auth.uid;

  const snap = await db
    .collection('notifications')
    .where('userId', '==', uid)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();

  const notifications = snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      id: d.id,
      ...data,
      createdAt: toMillis(data.createdAt),
    };
  });

  return { notifications, total: notifications.length };
});
