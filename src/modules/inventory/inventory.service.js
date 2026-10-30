const crypto = require('crypto');
const prisma = require('../../config/database');
const { applyMovement, lockStoreStock } = require('../products/stock.service');
const { logAudit } = require('../../services/audit.service');

const err = (m, s = 400) => { const e = new Error(m); e.status = s; return e; };
const num = (p) => `${p}-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${crypto.randomInt(1000, 10000)}`;

const fullInclude = {
  store: { select: { id: true, code: true, name: true } },
  lines: {
    include: {
      product: { select: { id: true, name: true, sku: true, barcode: true } },
      variant: { select: { id: true, size: true, color: true, sku: true, barcode: true } },
    },
  },
};

async function list(query = {}, storeIds = null) {
  const where = {};
  if (query.status) where.status = query.status;
  if (query.storeId) where.storeId = query.storeId;
  else if (Array.isArray(storeIds) && storeIds.length) where.storeId = { in: storeIds };
  return prisma.inventorySession.findMany({
    where, orderBy: { createdAt: 'desc' }, take: 100,
    include: { store: { select: { id: true, code: true, name: true } }, _count: { select: { lines: true } } },
  });
}

async function get(id) {
  const s = await prisma.inventorySession.findUnique({ where: { id }, include: fullInclude });
  if (!s) throw err('Inventaire introuvable.', 404);
  return s;
}

async function create({ storeId, notes, createdBy = null, ip = null }) {
  if (!storeId) throw err('storeId requis.');
  return prisma.$transaction(async (tx) => {
    const open = await tx.inventorySession.findFirst({ where: { storeId, status: 'OPEN' } });
    if (open) throw err(`Un inventaire est deja ouvert pour cette boutique (${open.number}).`, 409);
    const stocks = await tx.storeStock.findMany({ where: { storeId } });
    const session = await tx.inventorySession.create({
      data: {
        number: num('INV'), storeId, notes: notes || null, createdBy,
        lines: { create: stocks.map((s) => ({ productId: s.productId, variantId: s.variantId, expectedQty: s.quantity })) },
      },
    });
    await logAudit({ tx, userId: createdBy, storeId, action: 'INVENTORY_CREATE', module: 'inventory', entityId: session.id, entityType: 'InventorySession', newValue: { number: session.number, lines: stocks.length }, ip });
    return session;
  }, { timeout: 30000, maxWait: 10000 });
}

async function count(id, counts) {
  if (!Array.isArray(counts) || !counts.length) throw err('Aucun comptage.');
  return prisma.$transaction(async (tx) => {
    const s = await tx.inventorySession.findUnique({ where: { id } });
    if (!s) throw err('Inventaire introuvable.', 404);
    if (s.status !== 'OPEN') throw err('Inventaire deja cloture.');
    for (const c of counts) {
      const q = Number(c.countedQty);
      if (!c.productId || !Number.isInteger(q) || q < 0) throw err('Comptage invalide.');
      const variantId = c.variantId || null;
      const line = await tx.inventoryLine.findFirst({ where: { sessionId: id, productId: c.productId, variantId } });
      if (line) {
        await tx.inventoryLine.update({ where: { id: line.id }, data: { countedQty: q } });
      } else {
        const st = await tx.storeStock.findFirst({ where: { storeId: s.storeId, productId: c.productId, variantId } });
        await tx.inventoryLine.create({ data: { sessionId: id, productId: c.productId, variantId, expectedQty: st?.quantity ?? 0, countedQty: q } });
      }
    }
    return { updated: counts.length };
  }, { timeout: 30000, maxWait: 10000 });
}

async function validate(id, userId = null, ip = null) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "InventorySession" WHERE id = ${id} FOR UPDATE`;
    const s = await tx.inventorySession.findUnique({ where: { id }, include: { lines: true } });
    if (!s) throw err('Inventaire introuvable.', 404);
    if (s.status !== 'OPEN') throw err('Inventaire deja cloture.');
    let gains = 0; let losses = 0; let adjusted = 0;
    for (const l of s.lines) {
      if (l.countedQty == null) continue;
      const cur = await lockStoreStock(tx, { storeId: s.storeId, productId: l.productId, variantId: l.variantId });
      const diff = l.countedQty - cur.quantity;
      if (diff !== 0) {
        await applyMovement(tx, {
          storeId: s.storeId, productId: l.productId, variantId: l.variantId,
          type: diff > 0 ? 'IN' : 'OUT_LOSS', quantity: Math.abs(diff),
          reason: `Inventaire ${s.number}`, reference: s.number, createdBy: userId,
        });
        adjusted++;
        if (diff > 0) gains += diff; else losses += -diff;
      }
      await tx.inventoryLine.update({ where: { id: l.id }, data: { appliedDiff: diff } });
    }
    await tx.inventorySession.update({ where: { id }, data: { status: 'VALIDATED', validatedBy: userId, validatedAt: new Date() } });
    await logAudit({ tx, userId, storeId: s.storeId, action: 'INVENTORY_VALIDATE', module: 'inventory', entityId: id, entityType: 'InventorySession', newValue: { adjusted, gains, losses }, ip });
    return { number: s.number, adjusted, gains, losses };
  }, { timeout: 60000, maxWait: 10000 });
}

async function cancel(id, userId = null, ip = null) {
  return prisma.$transaction(async (tx) => {
    const s = await tx.inventorySession.findUnique({ where: { id } });
    if (!s) throw err('Inventaire introuvable.', 404);
    if (s.status !== 'OPEN') throw err('Seul un inventaire ouvert peut etre annule.');
    const up = await tx.inventorySession.update({ where: { id }, data: { status: 'CANCELLED' } });
    await logAudit({ tx, userId, storeId: s.storeId, action: 'INVENTORY_CANCEL', module: 'inventory', entityId: id, entityType: 'InventorySession', newValue: { status: 'CANCELLED' }, ip });
    return up;
  });
}

module.exports = { list, get, create, count, validate, cancel };