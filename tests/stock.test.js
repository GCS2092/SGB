require('dotenv').config();
const assert = require('assert');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const S = require('../src/modules/products/stock.service');
const tag = 'TST' + Date.now();
let ok = 0;
const check = async (name, fn) => { try { await fn(); ok++; console.log('  OK    ' + name); } catch (e) { console.log('  ECHEC ' + name + ' -> ' + e.message); process.exitCode = 1; } };
(async () => {
  const a = await prisma.store.create({ data: { code: tag + 'A', name: 'Test A' } });
  const b = await prisma.store.create({ data: { code: tag + 'B', name: 'Test B' } });
  const cat = await prisma.category.create({ data: { name: tag, slug: tag } });
  const p = await prisma.product.create({ data: { name: tag, slug: tag, description: 'x', price: 1000, categoryId: cat.id, stock: 0 } });
  const qty = async (sid) => (await prisma.storeStock.findFirst({ where: { storeId: sid, productId: p.id, variantId: null } }))?.quantity ?? 0;
  const total = async () => (await prisma.product.findUnique({ where: { id: p.id } })).stock;
  try {
    await check('entree +10 en A', async () => {
      await prisma.$transaction((tx) => S.applyMovement(tx, { storeId: a.id, productId: p.id, type: 'IN', quantity: 10 }));
      assert.strictEqual(await qty(a.id), 10); assert.strictEqual(await total(), 10);
    });
    await check('transfert 4 de A vers B : A=6, B=4, total=10', async () => {
      await prisma.$transaction((tx) => S.transferStock(tx, { fromStoreId: a.id, toStoreId: b.id, items: [{ productId: p.id, quantity: 4 }], transferNumber: 'T', createdBy: null }));
      assert.strictEqual(await qty(a.id), 6); assert.strictEqual(await qty(b.id), 4); assert.strictEqual(await total(), 10);
    });
    await check('transfert > stock refuse', async () => {
      await assert.rejects(prisma.$transaction((tx) => S.transferStock(tx, { fromStoreId: a.id, toStoreId: b.id, items: [{ productId: p.id, quantity: 7 }], transferNumber: 'T2', createdBy: null })), /insuffisant/i);
      assert.strictEqual(await qty(a.id), 6);
    });
    await check('perte -2 en B', async () => {
      await prisma.$transaction((tx) => S.applyMovement(tx, { storeId: b.id, productId: p.id, type: 'OUT_LOSS', quantity: 2 }));
      assert.strictEqual(await qty(b.id), 2); assert.strictEqual(await total(), 8);
    });
    await check('sortie > stock refusee', async () => {
      await assert.rejects(prisma.$transaction((tx) => S.applyMovement(tx, { storeId: b.id, productId: p.id, type: 'OUT_LOSS', quantity: 5 })), /insuffisant/i);
    });
    await check('concurrence : 5 sorties de 2 sur A (6) -> 3 reussies, stock 0', async () => {
      const res = await Promise.allSettled(Array.from({ length: 5 }, () => prisma.$transaction((tx) => S.applyMovement(tx, { storeId: a.id, productId: p.id, type: 'OUT_LOSS', quantity: 2 }))));
      assert.strictEqual(res.filter((r) => r.status === 'fulfilled').length, 3);
      assert.strictEqual(await qty(a.id), 0); assert.strictEqual(await total(), 2);
    });
    await check('reservation puis vente', async () => {
      await prisma.$transaction((tx) => S.applyMovement(tx, { storeId: a.id, productId: p.id, type: 'IN', quantity: 5 }));
      await prisma.$transaction((tx) => S.reserveStockItems(tx, [{ productId: p.id, quantity: 3 }], a.id));
      await assert.rejects(prisma.$transaction((tx) => S.reserveStockItems(tx, [{ productId: p.id, quantity: 3 }], a.id)), /insuffisant/i);
      const order = null;
      await prisma.$transaction((tx) => S.fulfillStockSale(tx, [{ productId: p.id, quantity: 3 }], 'ord-test', null, a.id));
      assert.strictEqual(await qty(a.id), 2);
      const line = await prisma.storeStock.findFirst({ where: { storeId: a.id, productId: p.id, variantId: null } });
      assert.strictEqual(line.reservedQuantity, 0);
    });
    await check('annulation : entree +3 puis mouvement inverse', async () => {
      const before = await qty(b.id);
      const mv = await prisma.$transaction((tx) => S.applyMovement(tx, { storeId: b.id, productId: p.id, type: 'IN', quantity: 3 }));
      assert.strictEqual(await qty(b.id), before + 3);
      await prisma.$transaction((tx) => S.applyMovement(tx, { storeId: mv.storeId, productId: p.id, type: 'OUT_LOSS', quantity: 3, reference: 'CANCEL:' + mv.id }));
      assert.strictEqual(await qty(b.id), before);
    });
  } finally {
    await prisma.stockMovement.deleteMany({ where: { productId: p.id } });
    await prisma.storeStock.deleteMany({ where: { productId: p.id } });
    await prisma.product.delete({ where: { id: p.id } });
    await prisma.category.delete({ where: { id: cat.id } });
    await prisma.store.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    await prisma.$disconnect();
  }
  console.log(`\n${ok} test(s) reussi(s)` + (process.exitCode ? ' - AU MOINS UN ECHEC' : ''));
})().catch((e) => { console.error('ERREUR', e.message); process.exit(1); });