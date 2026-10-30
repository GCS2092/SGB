process.env.NODE_ENV = 'test';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const svc = require('../src/modules/products/stock.service');

function makeTx(row) {
  const calls = { storeStock: [], product: [], variant: [], movement: [] };
  return {
    calls,
    $queryRaw: async () => [row],
    store: { findFirst: async () => ({ id: 'S1' }) },
    storeStock: { update: async (a) => { calls.storeStock.push(a); } },
    product: { update: async (a) => { calls.product.push(a); } },
    productVariant: { update: async (a) => { calls.variant.push(a); } },
    stockMovement: { create: async (a) => { calls.movement.push(a); return a.data; } },
  };
}
const row = (quantity, reservedQuantity = 0) => ({ id: 'r1', quantity, reservedQuantity });
const base = { storeId: 'S1', productId: 'P1' };

test('refuse une sortie superieure au stock', async () => {
  const tx = makeTx(row(5));
  await assert.rejects(
    () => svc.adjustStock(tx, { ...base, delta: -6 }),
    (e) => e.status === 400 && /Stock insuffisant/.test(e.message),
  );
  assert.equal(tx.calls.storeStock.length, 0);
  assert.equal(tx.calls.product.length, 0);
});

test('accepte une sortie egale au stock et met a jour le total', async () => {
  const tx = makeTx(row(5));
  const r = await svc.adjustStock(tx, { ...base, delta: -5 });
  assert.equal(r.quantity, 0);
  assert.equal(tx.calls.storeStock[0].data.quantity, 0);
  assert.deepEqual(tx.calls.product[0].data.stock, { increment: -5 });
});

test('met a jour le total de la variante, pas du produit', async () => {
  const tx = makeTx(row(5));
  await svc.adjustStock(tx, { ...base, variantId: 'V1', delta: 3 });
  assert.equal(tx.calls.variant.length, 1);
  assert.equal(tx.calls.product.length, 0);
});

test('refuse une reservation superieure au disponible', async () => {
  const tx = makeTx(row(5, 3));
  await assert.rejects(
    () => svc.adjustStock(tx, { ...base, reservedDelta: 3 }),
    (e) => e.status === 400 && /Stock insuffisant/.test(e.message),
  );
});

test('la liberation de reservation ne descend jamais sous 0', async () => {
  const tx = makeTx(row(5, 3));
  const r = await svc.adjustStock(tx, { ...base, reservedDelta: -10 });
  assert.equal(r.reservedQuantity, 0);
});

test('allowNegative autorise un stock negatif', async () => {
  const tx = makeTx(row(2));
  const r = await svc.adjustStock(tx, { ...base, delta: -5, allowNegative: true });
  assert.equal(r.quantity, -3);
});

test('applyMovement refuse les quantites invalides', async () => {
  for (const quantity of [0, -2, 1.5, 'abc', null]) {
    const tx = makeTx(row(5));
    await assert.rejects(() => svc.applyMovement(tx, { ...base, type: 'IN', quantity }), /Quantite invalide/, String(quantity));
    assert.equal(tx.calls.movement.length, 0);
  }
});

test('applyMovement OUT_LOSS retire du stock et trace le mouvement', async () => {
  const tx = makeTx(row(5));
  await svc.applyMovement(tx, { ...base, type: 'OUT_LOSS', quantity: 2, unitCost: 100 });
  assert.equal(tx.calls.storeStock[0].data.quantity, 3);
  assert.equal(tx.calls.movement[0].data.quantity, 2);
  assert.equal(tx.calls.movement[0].data.totalCost, 200);
});

test('applyMovement IN et ADJUSTMENT ajoutent, OUT_SALE retire', async () => {
  for (const [type, expected] of [['IN', 8], ['ADJUSTMENT', 8], ['OUT_SALE', 2]]) {
    const tx = makeTx(row(5));
    await svc.applyMovement(tx, { ...base, type, quantity: 3 });
    assert.equal(tx.calls.storeStock[0].data.quantity, expected, type);
  }
});
