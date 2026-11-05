/**
 * Portfolio card transfers.
 *
 * Portfolio entries live at `users/{uid}/portfolio/{cardId}` with the
 * shape { cardId, quantity, avgBuyPrice, addedAt, condition, source }.
 *
 * This module holds the card-moving logic separately from the Cloud
 * Function so it can be unit-tested without a live Firestore.
 */

/**
 * The slice of the Firestore API this module needs. Keeping it narrow
 * lets the tests supply an in-memory fake.
 */
export interface PortfolioDoc {
  id: string;
  path: string;
  get(): Promise<{ exists: boolean; data(): any }>;
  set(data: any, options?: { merge?: boolean }): Promise<any>;
  update(data: any): Promise<any>;
  delete(): Promise<any>;
}

export interface PortfolioDb {
  doc(path: string): PortfolioDoc;
}

/**
 * Decrement a portfolio entry by one. Deletes the doc when it hits zero.
 *
 * Returns false when the entry is missing or has no quantity left — the
 * caller must abort BEFORE writing anything else, so a trade can never
 * half-complete.
 */
export async function decrementPortfolio(
  db: PortfolioDb,
  uid: string,
  cardId: string,
): Promise<boolean> {
  const ref = db.doc(`users/${uid}/portfolio/${cardId}`);
  const snap = await ref.get();
  if (!snap.exists) return false;
  const qty = Number(snap.data()?.quantity ?? 0);
  if (qty < 1) return false;
  if (qty === 1) {
    await ref.delete();
  } else {
    await ref.update({ quantity: qty - 1 });
  }
  return true;
}

/** Add (or increment) a card in a user's portfolio. */
export async function incrementPortfolio(
  db: PortfolioDb,
  uid: string,
  cardId: string,
  opts: { avgBuyPrice?: number; condition?: string; source?: string },
): Promise<void> {
  const ref = db.doc(`users/${uid}/portfolio/${cardId}`);
  const snap = await ref.get();
  if (snap.exists) {
    const current = Number(snap.data()?.quantity ?? 0);
    await ref.update({ quantity: current + 1, addedAt: Date.now() });
  } else {
    await ref.set({
      cardId,
      quantity: 1,
      avgBuyPrice: opts.avgBuyPrice ?? 0,
      condition: opts.condition ?? 'Near Mint',
      source: opts.source ?? 'trade',
      addedAt: Date.now(),
    });
  }
}
