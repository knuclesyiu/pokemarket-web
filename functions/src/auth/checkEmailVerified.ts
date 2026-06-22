/**
 * Check if the current user has verified their email.
 * Used by client to gate listing creation / checkout.
 */
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export const checkEmailVerified = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', '需要登入');
  const uid = request.auth.uid;

  const user = await admin.auth().getUser(uid);
  if (user.emailVerified) {
    // Mirror the verified state to Firestore so rules can read it
    // (custom claims are also possible but require token refresh)
    await db.doc(`users/${uid}`).set({
      emailVerified: true,
      emailVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { verified: true };
  }
  return { verified: false };
});
