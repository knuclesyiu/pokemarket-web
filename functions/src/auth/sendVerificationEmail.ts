/**
 * Send a Firebase email verification link to the current user.
 *
 * Note: Firebase Admin SDK generates the link but does NOT send the email.
 * We use SendGrid here — replace with your transactional email provider.
 *
 * In production:
 *   - Set SENDGRID_API_KEY as a function secret
 *   - Use Firebase Extension "Trigger Email" for simplicity
 */
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';


export const sendVerificationEmail = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', '需要登入');
  const uid = request.auth.uid;

  const user = await admin.auth().getUser(uid);
  if (user.emailVerified) {
    return { alreadyVerified: true };
  }
  if (!user.email) {
    throw new functions.HttpsError('failed-precondition', '帳戶未綁定 Email');
  }

  // Generate verification link
  const link = await admin.auth().generateEmailVerificationLink(user.email, {
    url: 'https://pokemarket.app/email-verified',
  });

  // TODO: send via SendGrid/Mailgun
  // await sendViaSendGrid(user.email, link);
  console.log(`[sendVerificationEmail] would email ${user.email}: ${link}`);

  return { sent: true, devLink: process.env.NODE_ENV !== 'production' ? link : undefined };
});
