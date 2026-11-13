/**
 * Get (or create) the chat thread between two users.
 *
 * The caller must be one of the two participants — `request.auth.uid` is
 * always used as the caller's identity, never a client-supplied value.
 *
 * The participant list is stored in `parties` — that is the field name
 * the app's ChatThread type and both chat screens query on.
 */
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { FieldValue } from 'firebase-admin/firestore';
const db = admin.firestore();

export const createChatThread = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', '需要登入');
  const callerId = request.auth.uid;

  const { listingId, parties } = request.data as {
    listingId?: string;
    parties?: string[];
  };

  if (!parties || !Array.isArray(parties)) {
    throw new functions.HttpsError('invalid-argument', '缺少參與者');
  }

  // Normalise to exactly two distinct participants and require the
  // caller to be one of them.
  const unique = Array.from(new Set(parties.filter(Boolean)));
  if (unique.length !== 2) {
    throw new functions.HttpsError('invalid-argument', '對話必須有兩位參與者');
  }
  if (!unique.includes(callerId)) {
    throw new functions.HttpsError('permission-denied', '你唔係呢個對話嘅參與者');
  }
  const [uidA, uidB] = [callerId, unique.find((p) => p !== callerId) as string];

  // Look for an existing thread between the same two people.
  // Firestore allows only one array-contains per query, so we query on
  // one participant and filter for the other in JS.
  const existing = await db
    .collection('chat_threads')
    .where('parties', 'array-contains', callerId)
    .get();

  const match = existing.docs.find((d) => {
    const p = d.data()?.parties as string[] | undefined;
    return Array.isArray(p) && p.includes(uidA) && p.includes(uidB);
  });

  if (match) {
    return { threadId: match.id, created: false };
  }

  const threadRef = db.collection('chat_threads').doc();
  await threadRef.set({
    id: threadRef.id,
    parties: [uidA, uidB].sort(),
    listingId: listingId ?? null,
    lastMessage: '',
    lastMessageAt: FieldValue.serverTimestamp(),
    unreadCount: {},
    createdAt: FieldValue.serverTimestamp(),
    status: 'open',
  });

  return { threadId: threadRef.id, created: true };
});
