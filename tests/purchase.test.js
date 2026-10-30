require('dotenv').config();
const assert = require('assert');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const PO = require('../src/modules/purchase-orders/purchase-orders.service');
const INV = require('../src/modules/inventory/inventory.service');
const tag = 'TPO' + Date.now();
let ok = 0;
const check = async (name, fn) => { try { await fn(); ok++; console.log('  OK    ' + name); } catch (e) { console.log('  ECHEC ' + name + ' -> ' + e.message); process.exitCode = 1; } };
(async () => {
  const store = await prisma.store.create({ data: { code: tag, name: 'Test PO' } });
  const sup = await prisma.supplier.create({ data: { name: tag } });
  const cat = await prisma.category.create({ data: { name: tag, slug: tag } });
  const p = await prisma.product.create({ data: { name: tag, slug: tag, description: 'x', price: 1000, categoryId: cat.id, stock: 0 } });
  const qty = async () => (await prisma.storeStock.findFirst({ where: { storeId: store.id, productId: p.id, variantId: null } }))?.quantity ?? 0;
  const total = async () => (await prisma.product.findUnique({ where: { id: p.id } })).stock;
  let po;
  try {
    await check('creation bon : brouillon avec 1 ligne', async () => {
      po = await PO.create({ storeId: store.id, supplierId: sup.id, items: [{ productId: p.id, quantity: 10, unitCost: 500 }] });
      assert.strictEqual(po.status, 'DRAFT'); assert.strictEqual(po.items.length, 1);
    });
    await check('reception refusee sur un brouillon', async () => {
      await assert.rejects(PO.receive(po.id, [{ itemId: po.items[0].id, quantity: 1 }]), /etat actuel/i);
    });
    await check('envoi : ORDERED', async () => { po = await PO.send(po.id); assert.strictEqual(po.status, 'ORDERED'); });
    await check('reception partielle 4 : PARTIAL, stock 4', async () => {
      po = await PO.receive(po.id, [{ itemId: po.items[0].id, quantity: 4 }]);
      assert.strictEqual(po.status, 'PARTIAL'); assert.strictEqual(await qty(), 4); assert.strictEqual(await total(), 4);
      assert.strictEqual((await prisma.product.findUnique({ where: { id: p.id } })).purchasePrice, 500);
    });
    await check('sur-reception 7 refusee (reste 6)', async () => {
      await assert.rejects(PO.receive(po.id, [{ itemId: po.items[0].id, quantity: 7 }]), /superieure/i);
      assert.strictEqual(await qty(), 4);
    });
    await check('annulation refusee apres reception', async () => { await assert.rejects(PO.cancel(po.id), /impossible/i); });
    await check('reception du solde 6 : RECEIVED, stock 10', async () => {
      po = await PO.receive(po.id, [{ itemId: po.items[0].id, quantity: 6 }]);
      assert.strictEqual(po.status, 'RECEIVED'); assert.strictEqual(await qty(), 10); assert.strictEqual(await total(), 10);
    });
    await check('reception apres cloture refusee', async () => { await assert.rejects(PO.receive(po.id, [{ itemId: po.items[0].id, quantity: 1 }]), /etat actuel/i); });
    let s;
    await check('inventaire : session avec photo du stock (attendu 10)', async () => {
      s = await INV.create({ storeId: store.id });
      const full = await INV.get(s.id);
      assert.strictEqual(full.lines.find((l) => l.productId === p.id).expectedQty, 10);
    });
    await check('deuxieme inventaire ouvert refuse', async () => { await assert.rejects(INV.create({ storeId: store.id }), /deja ouvert/i); });
    await check('comptage 7 puis validation : stock 7, perte 3', async () => {
      await INV.count(s.id, [{ productId: p.id, countedQty: 7 }]);
      const r = await INV.validate(s.id);
      assert.strictEqual(r.losses, 3); assert.strictEqual(await qty(), 7); assert.strictEqual(await total(), 7);
    });
    await check('inventaire valide non modifiable', async () => { await assert.rejects(INV.count(s.id, [{ productId: p.id, countedQty: 1 }]), /cloture/i); });
    await check('2e inventaire : comptage 9, gain 2, stock 9', async () => {
      const s2 = await INV.create({ storeId: store.id });
      await INV.count(s2.id, [{ productId: p.id, countedQty: 9 }]);
      const r = await INV.validate(s2.id);
      assert.strictEqual(r.gains, 2); assert.strictEqual(await qty(), 9); assert.strictEqual(await total(), 9);
    });
  } finally {
    await prisma.stockMovement.deleteMany({ where: { productId: p.id } });
    await prisma.inventorySession.deleteMany({ where: { storeId: store.id } });
    await prisma.purchaseOrder.deleteMany({ where: { storeId: store.id } });
    await prisma.auditLog.deleteMany({ where: { storeId: store.id } });
    await prisma.storeStock.deleteMany({ where: { productId: p.id } });
    await prisma.product.delete({ where: { id: p.id } });
    await prisma.category.delete({ where: { id: cat.id } });
    await prisma.supplier.delete({ where: { id: sup.id } });
    await prisma.store.delete({ where: { id: store.id } });
    await prisma.$disconnect();
  }
  console.log(`\n${ok} test(s) reussi(s)` + (process.exitCode ? ' - AU MOINS UN ECHEC' : ''));
})().catch((e) => { console.error('ERREUR', e.message); process.exit(1); });