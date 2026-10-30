const crypto = require('crypto');
const prisma = require('../../config/database');
const { applyMovement } = require('../products/stock.service');
const { logAudit } = require('../../services/audit.service');

const err = (m, s = 400) => { const e = new Error(m); e.status = s; return e; };
const num = (p) => `${p}-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${crypto.randomInt(1000, 10000)}`;

const fullInclude = {
  supplier: { select: { id: true, name: true, phone: true } },
  store: { select: { id: true, code: true, name: true } },
  items: {
    include: {
      product: { select: { id: true, name: true, sku: true } },
      variant: { select: { id: true, size: true, color: true } },
    },
  },
};

async function list(query = {}, storeIds = null) {
  const where = {};
  if (query.status) where.status = query.status;
  if (query.supplierId) where.supplierId = query.supplierId;
  if (query.storeId) where.storeId = query.storeId;
  else if (Array.isArray(storeIds) && storeIds.length) where.storeId = { in: storeIds };
  return prisma.purchaseOrder.findMany({
    where, orderBy: { createdAt: 'desc' }, take: 200,
    include: { supplier: { select: { id: true, name: true } }, store: { select: { id: true, code: true, name: true } }, _count: { select: { items: true } } },
  });
}

async function get(id) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: fullInclude });
  if (!po) throw err('Bon de commande introuvable.', 404);
  return po;
}

async function create({ storeId, supplierId, items, notes, expectedAt, createdBy = null, ip = null }) {
  if (!storeId || !supplierId) throw err('Boutique et fournisseur requis.');
  if (!Array.isArray(items) || !items.length) throw err('Au moins une ligne est requise.');
  for (const it of items) {
    if (!it.productId || !Number.isInteger(it.quantity) || it.quantity < 1) throw err('Chaque ligne doit avoir un produit et une quantite entiere positive.');
    if (!Number.isInteger(it.unitCost) || it.unitCost < 0) throw err('Le cout unitaire doit etre un entier positif ou nul.');
  }
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier || supplier.deletedAt) throw err('Fournisseur introuvable.', 404);
  return prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.create({
      data: {
        poNumber: num('PO'), storeId, supplierId, notes: notes || null, createdBy,
        expectedAt: expectedAt ? new Date(expectedAt) : null,
        items: { create: items.map((it) => ({ productId: it.productId, variantId: it.variantId || null, quantityOrdered: it.quantity, unitCost: it.unitCost })) },
      },
      include: fullInclude,
    });
    await logAudit({ tx, userId: createdBy, storeId, action: 'PURCHASE_ORDER_CREATE', module: 'purchase-orders', entityId: po.id, entityType: 'PurchaseOrder', newValue: { poNumber: po.poNumber }, ip });
    return po;
  });
}

async function send(id, userId = null, ip = null) {
  return prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw err('Bon de commande introuvable.', 404);
    if (po.status !== 'DRAFT') throw err('Seul un brouillon peut etre envoye.');
    const up = await tx.purchaseOrder.update({ where: { id }, data: { status: 'ORDERED' }, include: fullInclude });
    await logAudit({ tx, userId, storeId: po.storeId, action: 'PURCHASE_ORDER_SEND', module: 'purchase-orders', entityId: id, entityType: 'PurchaseOrder', newValue: { status: 'ORDERED' }, ip });
    return up;
  });
}

async function receive(id, lines, userId = null, ip = null) {
  if (!Array.isArray(lines) || !lines.length) throw err('Aucune ligne a recevoir.');
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${id} FOR UPDATE`;
    const po = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
    if (!po) throw err('Bon de commande introuvable.', 404);
    if (!['ORDERED', 'PARTIAL'].includes(po.status)) throw err('Ce bon ne peut pas recevoir de marchandise dans son etat actuel.');
    for (const l of lines) {
      const item = po.items.find((i) => i.id === l.itemId);
      if (!item) throw err('Ligne inconnue pour ce bon.');
      if (!Number.isInteger(l.quantity) || l.quantity < 1) throw err('Quantite recue invalide.');
      if (item.quantityReceived + l.quantity > item.quantityOrdered) throw err(`Reception superieure a la commande (reste ${item.quantityOrdered - item.quantityReceived}).`);
      await applyMovement(tx, {
        storeId: po.storeId, productId: item.productId, variantId: item.variantId, type: 'IN', quantity: l.quantity,
        unitCost: item.unitCost, supplierId: po.supplierId, reference: po.poNumber, reason: `Reception ${po.poNumber}`, createdBy: userId,
      });
      await tx.purchaseOrderItem.update({ where: { id: item.id }, data: { quantityReceived: { increment: l.quantity } } });
      await tx.product.update({ where: { id: item.productId }, data: { purchasePrice: item.unitCost } });
    }
    const items = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: id } });
    const done = items.every((i) => i.quantityReceived >= i.quantityOrdered);
    await tx.purchaseOrder.update({ where: { id }, data: { status: done ? 'RECEIVED' : 'PARTIAL' } });
    await logAudit({ tx, userId, storeId: po.storeId, action: 'PURCHASE_ORDER_RECEIVE', module: 'purchase-orders', entityId: id, entityType: 'PurchaseOrder', newValue: { lines: lines.length, status: done ? 'RECEIVED' : 'PARTIAL' }, ip });
  }, { timeout: 30000, maxWait: 10000 });
  return get(id);
}

async function cancel(id, userId = null, ip = null) {
  return prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
    if (!po) throw err('Bon de commande introuvable.', 404);
    if (!['DRAFT', 'ORDERED'].includes(po.status) || po.items.some((i) => i.quantityReceived > 0)) throw err('Annulation impossible : marchandise deja recue ou bon cloture.');
    const up = await tx.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' }, include: fullInclude });
    await logAudit({ tx, userId, storeId: po.storeId, action: 'PURCHASE_ORDER_CANCEL', module: 'purchase-orders', entityId: id, entityType: 'PurchaseOrder', newValue: { status: 'CANCELLED' }, ip });
    return up;
  });
}

module.exports = { list, get, create, send, receive, cancel };