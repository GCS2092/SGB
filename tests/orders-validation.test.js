process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createOrder } = require('../src/modules/orders/orders.service');

const item = { productId: 'P1', quantity: 1 };
const rejects400 = (payload, re) =>
  assert.rejects(() => createOrder(payload, null), (e) => e.status === 400 && (!re || re.test(e.message)));

test('refuse une commande sans articles', async () => {
  await rejects400({ items: [], paymentMethod: 'CASH_ON_DELIVERY' }, /au moins un produit/);
  await rejects400({ paymentMethod: 'CASH_ON_DELIVERY' }, /au moins un produit/);
});

test('refuse les quantites 0, negatives, decimales ou texte', async () => {
  for (const quantity of [0, -1, 1.5, '2', null, undefined]) {
    await rejects400({ items: [{ productId: 'P1', quantity }], paymentMethod: 'CASH_ON_DELIVERY' }, /quantit/i);
  }
});

test('refuse un article sans produit', async () => {
  await rejects400({ items: [{ quantity: 1 }], paymentMethod: 'CASH_ON_DELIVERY' });
});

test('refuse une adresse de livraison incomplete', async () => {
  await rejects400({
    items: [item], paymentMethod: 'CASH_ON_DELIVERY',
    shippingAddress: { fullName: 'A' },
  }, /Adresse de livraison incompl/);
});

test('refuse le paiement a la livraison vers une destination internationale', async () => {
  await rejects400({
    items: [item], paymentMethod: 'CASH_ON_DELIVERY', destination: 'XX_INTERNATIONAL',
  }, /internationales/);
});
