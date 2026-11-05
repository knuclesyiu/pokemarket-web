/**
 * Tests for the portfolio card-transfer logic.
 *
 * Run: node functions/test/portfolio.test.mjs
 *
 * Uses an in-memory fake of the narrow Firestore surface the portfolio
 * module uses, so the card-movement rules can be verified without a
 * live database or emulator.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { decrementPortfolio, incrementPortfolio } = require('../lib-test/portfolio.js');

// ── in-memory Firestore fake ───────────────────────────────────────────────
function makeFakeDb(initial = {}) {
  const store = new Map(Object.entries(initial).map(([k, v]) => [k, { ...v }]));
  return {
    store,
    db: {
      doc(path) {
        return {
          id: path.split('/').pop(),
          path,
          async get() {
            const d = store.get(path);
            return { exists: !!d, data: () => (d ? { ...d } : undefined) };
          },
          async set(data) {
            store.set(path, { ...(store.get(path) ?? {}), ...data });
          },
          async update(data) {
            const cur = store.get(path) ?? {};
            store.set(path, { ...cur, ...data });
          },
          async delete() {
            store.delete(path);
          },
        };
      },
    },
  };
}

// ── test runner ────────────────────────────────────────────────────────────
const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (e) {
    results.push({ name, ok: false, err: e });
    console.log(`FAIL  ${name}\n      ${e.message}`);
  }
}

await test('decrement reduces quantity by one', async () => {
  const { db, store } = makeFakeDb({
    'users/u1/portfolio/c1': { cardId: 'c1', quantity: 3 },
  });
  const ok = await decrementPortfolio(db, 'u1', 'c1');
  assert.equal(ok, true);
  assert.equal(store.get('users/u1/portfolio/c1').quantity, 2);
});

await test('decrement deletes the entry when quantity reaches zero', async () => {
  const { db, store } = makeFakeDb({
    'users/u1/portfolio/c1': { cardId: 'c1', quantity: 1 },
  });
  const ok = await decrementPortfolio(db, 'u1', 'c1');
  assert.equal(ok, true);
  assert.equal(store.has('users/u1/portfolio/c1'), false);
});

await test('decrement returns false when the entry is missing', async () => {
  const { db } = makeFakeDb({});
  const ok = await decrementPortfolio(db, 'u1', 'missing');
  assert.equal(ok, false);
});

await test('decrement returns false when quantity is zero', async () => {
  const { db } = makeFakeDb({
    'users/u1/portfolio/c1': { cardId: 'c1', quantity: 0 },
  });
  const ok = await decrementPortfolio(db, 'u1', 'c1');
  assert.equal(ok, false);
});

await test('increment creates the entry when absent', async () => {
  const { db, store } = makeFakeDb({});
  await incrementPortfolio(db, 'u1', 'c2', { avgBuyPrice: 50, condition: 'Mint' });
  const d = store.get('users/u1/portfolio/c2');
  assert.equal(d.quantity, 1);
  assert.equal(d.cardId, 'c2');
  assert.equal(d.avgBuyPrice, 50);
  assert.equal(d.condition, 'Mint');
  assert.equal(d.source, 'trade');
});

await test('increment adds to an existing entry', async () => {
  const { db, store } = makeFakeDb({
    'users/u1/portfolio/c2': { cardId: 'c2', quantity: 2 },
  });
  await incrementPortfolio(db, 'u1', 'c2', {});
  assert.equal(store.get('users/u1/portfolio/c2').quantity, 3);
});

await test('a full swap conserves total card count', async () => {
  // Buyer holds 2x c1, seller holds 1x c2. The buyer gives up one c1
  // and receives the seller's c2.
  const { db, store } = makeFakeDb({
    'users/buyer/portfolio/c1': { cardId: 'c1', quantity: 2 },
    'users/seller/portfolio/c2': { cardId: 'c2', quantity: 1 },
  });

  const countAll = () =>
    Array.from(store.values()).reduce((s, v) => s + Number(v.quantity ?? 0), 0);
  const countOf = (uid) =>
    Array.from(store.entries())
      .filter(([k]) => k.startsWith(`users/${uid}/portfolio/`))
      .reduce((s, [, v]) => s + Number(v.quantity ?? 0), 0);

  assert.equal(countAll(), 3, 'starts with 3 cards in total');

  // Buyer gives up one c1, receives the seller's c2.
  await decrementPortfolio(db, 'buyer', 'c1');
  await decrementPortfolio(db, 'seller', 'c2');
  await incrementPortfolio(db, 'buyer', 'c2', {});
  await incrementPortfolio(db, 'seller', 'c1', {});

  assert.equal(countAll(), 3, 'no cards created or destroyed');
  assert.equal(countOf('buyer'), 2, 'buyer still holds 2 cards');
  assert.equal(countOf('seller'), 1, 'seller still holds 1 card');
  assert.equal(store.get('users/buyer/portfolio/c1').quantity, 1);
  assert.equal(store.get('users/seller/portfolio/c1').quantity, 1);
  assert.equal(store.get('users/buyer/portfolio/c2').quantity, 1);
  assert.equal(store.has('users/seller/portfolio/c2'), false);
});

await test('a missing card aborts before any other write', async () => {
  // Buyer claims to offer a card they do not hold.
  const { db, store } = makeFakeDb({
    'users/buyer/portfolio/c1': { cardId: 'c1', quantity: 1 },
    'users/seller/portfolio/c2': { cardId: 'c2', quantity: 1 },
  });

  const ok = await decrementPortfolio(db, 'buyer', 'c_not_owned');
  assert.equal(ok, false, 'must report failure');
  // Nothing else was touched.
  assert.equal(store.get('users/buyer/portfolio/c1').quantity, 1);
  assert.equal(store.get('users/seller/portfolio/c2').quantity, 1);
});

const failed = results.filter((r) => !r.ok);
console.log('');
console.log(`${results.length - failed.length}/${results.length} tests passed`);
if (failed.length) process.exit(1);
