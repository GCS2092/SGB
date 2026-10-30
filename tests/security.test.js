process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret-0123';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const jwt = require('jsonwebtoken');
const { signToken } = require('../src/utils/jwt.utils');
const app = require('../src/app');

let server;
let base;

before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const call = (path, { method = 'GET', token } = {}) =>
  fetch(base + path, { method, headers: token ? { Authorization: `Bearer ${token}` } : {} });

const PROTECTED = [
  '/api/products', '/api/orders', '/api/settings', '/api/users/admin/all',
  '/api/notifications', '/api/admin/orders', '/api/admin/invoices',
  '/api/admin/credit-notes', '/api/admin/accounting/dashboard',
  '/api/admin/accounting/expenses', '/api/admin/audit', '/api/admin/inventory',
  '/api/admin/purchase-orders', '/api/admin/stock-transfers', '/api/admin/stores',
  '/api/admin/reports/download',
];

for (const path of PROTECTED) {
  test(`401 sans token : ${path}`, async () => {
    assert.equal((await call(path)).status, 401);
  });
}

test('401 sans token : POST /api/upload/image', async () => {
  assert.equal((await call('/api/upload/image', { method: 'POST' })).status, 401);
});

test('token illisible refuse', async () => {
  assert.equal((await call('/api/admin/invoices', { token: 'abc' })).status, 401);
});

test('token signe avec une autre cle refuse', async () => {
  const bad = jwt.sign({ id: 'x', role: 'ADMIN' }, 'une-autre-cle-secrete-0123456789');
  assert.equal((await call('/api/admin/invoices', { token: bad })).status, 401);
});

test('token alg=none refuse', async () => {
  const none = jwt.sign({ id: 'x', role: 'ADMIN' }, '', { algorithm: 'none' });
  assert.equal((await call('/api/admin/invoices', { token: none })).status, 401);
});

test('token expire refuse', async () => {
  const old = signToken({ id: 'x', role: 'ADMIN' }, { expiresIn: -10 });
  assert.equal((await call('/api/admin/invoices', { token: old })).status, 401);
});

test('token d etape 2FA inutilisable comme session', async () => {
  for (const purpose of ['pending2fa', 'setup2fa']) {
    const t = signToken({ id: 'x', role: 'ADMIN', purpose }, { expiresIn: '5m' });
    assert.equal((await call('/api/admin/invoices', { token: t })).status, 401, purpose);
    assert.equal((await call('/api/settings', { token: t })).status, 401, purpose);
  }
});

test('inscription publique desactivee', async () => {
  assert.equal((await call('/api/auth/register', { method: 'POST' })).status, 404);
  assert.equal((await call('/api/auth/google', { method: 'POST' })).status, 404);
});
