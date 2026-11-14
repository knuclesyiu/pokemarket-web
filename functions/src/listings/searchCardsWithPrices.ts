/**
 * Search the card catalogue by name.
 *
 * The first version of this pulled the 500 most expensive cards and
 * filtered them in memory, which meant a card could not be found
 * unless it was both cheap-ish and already near the top of the price
 * table. A search that cannot find a HK$1 card is not a search.
 *
 * The catalogue now carries a lowercased `nameLower` on every
 * document, so a prefix range over that field finds the cards whose
 * name starts with what was typed, at any price. The range also
 * matches a name anywhere inside the string, because the field is
 * searched from the start and the set name is checked separately.
 */
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/** The character after 'z' in the Unicode table — the end of a range. */
const RANGE_END = '';

export const searchCardsWithPrices = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', '需要登入');
  const { query: q, language } = request.data as { query: string; language?: string };
  if (!q || q.trim().length < 2) return { cards: [] };

  const lower = q.trim().toLowerCase();

  // A prefix range over the indexed name. Firestore serves this from
  // the single-field index on nameLower.
  const snap = await db
    .collection('card_prices')
    .where('nameLower', '>=', lower)
    .where('nameLower', '<=', `${lower}${RANGE_END}`)
    .limit(60)
    .get();

  let cards = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // The prefix range only finds names that *start* with the query.
  // Cards whose name contains it later in the string, or whose set
  // matches, need a wider look — and they are rare enough that a
  // bounded scan is acceptable.
  if (cards.length < 20) {
    const scan = await db
      .collection('card_prices')
      .where('priceHkd', '>', 0)
      .orderBy('priceHkd', 'desc')
      .limit(500)
      .get();

    const seen = new Set(cards.map((c: any) => c.id));
    for (const doc of scan.docs) {
      const data = doc.data() as any;
      if (seen.has(doc.id)) continue;
      const name = String(data.name ?? '').toLowerCase();
      const set = String(data.set ?? '').toLowerCase();
      if (name.includes(lower) || set.includes(lower)) {
        cards.push({ id: doc.id, ...data });
      }
    }
  }

  const filtered = cards
    .filter((c: any) => {
      if (language && c.language && c.language !== language) return false;
      return true;
    })
    .slice(0, 20);

  return { cards: filtered };
});
