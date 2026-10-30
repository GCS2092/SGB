process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret-0123';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { signToken } = require('../src/utils/jwt.utils');
const prisma = require('../src/config/database');
const app = require('../src/app');

const tag = 'TSTCN' + Date.now();
let server, base, store, order, invoice;
const admin = () => signToken({ id: 'test-admin', role: 'ADMIN' }, { expiresIn: '5m' });
const seller = () => signToken({ id: 'test-seller', role: 'SELLER' }, { expiresIn: '5m' });

const post = (body, token = admin()) =>
  fetch(base + '/api/admin/credit-notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: JSON.stringify(body),
  });

before(async () => {
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  store = await prisma.store.create({ data: { code: tag, name: 'Test avoirs' } });
  order = await prisma.order.create({
    data: { orderNumber: tag, storeId: store.id, paymentMethod: 'CASH_ON_DELIVERY', subtotal: 1000, shippingCost: 0, total: 1000 },
  });
  invoice = await prisma.invoice.create({
    data: { invoiceNumber: tag, storeId: store.id, orderId: order.id, subtotal: 1000, total: 1000 },
  });
});

after(async () => {
  const safe = async (fn) => { try { await fn(); } catch { /* ignore */ } };
  await safe(() => prisma.creditNote.deleteMany({ where: { invoiceId: invoice.id } }));
  await safe(() => prisma.invoice.delete({ where: { id: invoice.id } }));
  await safe(() => prisma.order.delete({ where: { id: order.id } }));
  await safe(() => prisma.store.delete({ where: { id: store.id } }));
  await new Promise((r) => server.close(r));
  await prisma.$disconnect();
});

const unchanged = async () => {
  const inv = await prisma.invoice.findUnique({ where: { id: invoice.id } });
  const n = await prisma.creditNote.count({ where: { invoiceId: invoice.id } });
  return inv.status !== 'CANCELLED' && n === 0;
};

test('401 sans token', async () => {
  assert.equal((await post({ invoiceId: invoice.id, amount: 100 }, null)).status, 401);
});

test('refuse un role non admin', async () => {
  assert.equal((await post({ invoiceId: invoice.id, amount: 100 }, seller())).status, 403);
  assert.ok(await unchanged());
});

test('refuse facture ou montant manquant', async () => {
  assert.equal((await post({ amount: 100 })).status, 400);
  assert.equal((await post({ invoiceId: invoice.id })).status, 400);
});

test('refuse un montant negatif, decimal ou texte', async () => {
  for (const amount of [-5, 1.5, 'abc']) {
    assert.equal((await post({ invoiceId: invoice.id, amount })).status, 400, String(amount));
  }
  assert.ok(await unchanged());
});

test('facture introuvable : 404', async () => {
  assert.equal((await post({ invoiceId: 'inexistante', amount: 100 })).status, 404);
});

test('montant superieur au total refuse, facture intacte', async () => {
  assert.equal((await post({ invoiceId: invoice.id, amount: 1001 })).status, 400);
  assert.ok(await unchanged());
});

test('avoir refuse sur une facture annulee', async () => {
  await prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'CANCELLED' } });
  assert.equal((await post({ invoiceId: invoice.id, amount: 100 })).status, 400);
  assert.equal(await prisma.creditNote.count({ where: { invoiceId: invoice.id } }), 0);
});
