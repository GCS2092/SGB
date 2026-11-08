const express = require('express');
const prisma = require('../../config/database');
const { authenticate } = require('../../middlewares/auth.middleware');
const requireStaff = require('../../middlewares/staff.middleware');
const { nextTransferNumber } = require('../../utils/invoice.utils');
const { logAudit } = require('../../services/audit.service');
const { assertStoreAccess } = require('../stores/store.service');
const { adjustStock } = require('../products/stock.service');

const router = express.Router();
const guard = [authenticate, requireStaff];
const httpErr = (m, s = 400) => { const e = new Error(m); e.status = s; return e; };

const inc = {
  fromStore: { select: { id: true, code: true, name: true } },
  toStore: { select: { id: true, code: true, name: true } },
  items: { include: { product: { select: { id: true, name: true } }, variant: { select: { id: true, size: true, color: true } } } },
};

// Creation multi-produits avec controle des lignes
router.post('/', guard, async (req, res, next) => {
  try {
    const { fromStoreId, toStoreId, items, notes } = req.body;
    if (!fromStoreId || !toStoreId || fromStoreId === toStoreId) throw httpErr('Boutiques source et destination invalides.');
    if (!Array.isArray(items) || !items.length) throw httpErr('Au moins un produit est requis.');
    const seen = new Set();
    for (const it of items) {
      if (!it.productId || !Number.isInteger(it.quantity) || it.quantity < 1) throw httpErr('Chaque ligne doit avoir un produit et une quantité entière positive.');
      const k = `${it.productId}|${it.variantId || ''}`;
      if (seen.has(k)) throw httpErr('Un même article ne peut apparaître qu’une seule fois.');
      seen.add(k);
    }
    await assertStoreAccess(req.user, fromStoreId);

    const products = await prisma.product.findMany({
      where: { id: { in: [...new Set(items.map((i) => i.productId))] } },
      include: { variants: { select: { id: true } } },
    });
    for (const it of items) {
      const p = products.find((x) => x.id === it.productId);
      if (!p) throw httpErr('Produit introuvable.', 404);
      if (p.variants.length && !it.variantId) throw httpErr(`Choisissez la variante pour « ${p.name} ».`);
      if (it.variantId && !p.variants.some((v) => v.id === it.variantId)) throw httpErr(`Variante invalide pour « ${p.name} ».`);
    }

    const transfer = await prisma.$transaction(async (tx) => {
      const transferNumber = await nextTransferNumber(tx);
      const created = await tx.stockTransfer.create({
        data: {
          transferNumber, fromStoreId, toStoreId, notes: notes || null, createdBy: req.user?.id,
          items: { create: items.map((i) => ({ productId: i.productId, variantId: i.variantId || null, quantity: i.quantity })) },
        },
        include: inc,
      });
      await logAudit({ tx, userId: req.user?.id, storeId: fromStoreId, action: 'STOCK_TRANSFER_CREATE', module: 'stock-transfers', entityId: created.id, entityType: 'StockTransfer', newValue: { transferNumber, lines: items.length }, ip: req.ip });
      return created;
    });
    res.status(201).json(transfer);
  } catch (err) { next(err); }
});

// Expedition : le stock sort de la boutique source
router.patch('/:id/ship', guard, async (req, res, next) => {
  try {
    const { id } = req.params;
    const out = await prisma.$transaction(async (tx) => {
      const existing = await tx.stockTransfer.findUnique({ where: { id }, include: { items: true } });
      if (!existing) throw httpErr('Transfert introuvable.', 404);
      if (existing.status !== 'PENDING') throw httpErr('Seul un transfert en attente peut être expédié.');
      await assertStoreAccess(req.user, existing.fromStoreId);
      const g = await tx.stockTransfer.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'SHIPPED', shippedBy: req.user?.id, shippedAt: new Date() } });
      if (g.count === 0) throw httpErr('Ce transfert a déjà été traité.');
      for (const it of existing.items) {
        await adjustStock(tx, { storeId: existing.fromStoreId, productId: it.productId, variantId: it.variantId || null, delta: -it.quantity });
        await tx.stockMovement.create({ data: { storeId: existing.fromStoreId, productId: it.productId, variantId: it.variantId || null, type: 'TRANSFER_OUT', quantity: it.quantity, transferId: id, createdBy: req.user?.id, reason: `Expédition ${existing.transferNumber}` } });
      }
      await logAudit({ tx, userId: req.user?.id, storeId: existing.fromStoreId, action: 'STOCK_TRANSFER_SHIP', module: 'stock-transfers', entityId: id, entityType: 'StockTransfer', newValue: { status: 'SHIPPED' }, ip: req.ip });
      return tx.stockTransfer.findUnique({ where: { id }, include: inc });
    }, { timeout: 30000, maxWait: 10000 });
    res.json(out);
  } catch (err) { next(err); }
});

// Reception : seules les quantites recues entrent en stock a la destination
router.patch('/:id/receive', guard, async (req, res, next) => {
  try {
    const { id } = req.params;
    const note = String(req.body.note || '').trim();
    const lines = Array.isArray(req.body.lines) ? req.body.lines : [];
    const out = await prisma.$transaction(async (tx) => {
      const existing = await tx.stockTransfer.findUnique({ where: { id }, include: { items: true } });
      if (!existing) throw httpErr('Transfert introuvable.', 404);
      if (existing.status !== 'SHIPPED') throw httpErr('Seul un transfert expédié peut être réceptionné.');
      await assertStoreAccess(req.user, existing.toStoreId);

      const byId = new Map(lines.map((l) => [l.itemId, l]));
      const plan = existing.items.map((it) => {
        const l = byId.get(it.id);
        const q = l ? Number(l.quantityReceived) : it.quantity;
        if (!Number.isInteger(q) || q < 0 || q > it.quantity) throw httpErr(`Quantité reçue invalide (0 à ${it.quantity}).`);
        return { it, q, lineNote: l?.note ? String(l.note).trim() : null };
      });
      const gaps = plan.filter((p) => p.q < p.it.quantity);
      if (gaps.length && note.length < 3) throw httpErr('Précisez un motif pour les écarts de réception.');

      const g = await tx.stockTransfer.updateMany({ where: { id, status: 'SHIPPED' }, data: { status: 'RECEIVED', receivedBy: req.user?.id, receivedAt: new Date(), receiveNotes: note || null } });
      if (g.count === 0) throw httpErr('Ce transfert a déjà été traité.');

      for (const { it, q, lineNote } of plan) {
        if (q > 0) {
          await adjustStock(tx, { storeId: existing.toStoreId, productId: it.productId, variantId: it.variantId || null, delta: q });
          await tx.stockMovement.create({ data: { storeId: existing.toStoreId, productId: it.productId, variantId: it.variantId || null, type: 'TRANSFER_IN', quantity: q, transferId: id, createdBy: req.user?.id, reason: `Réception ${existing.transferNumber}${q < it.quantity ? ` (écart ${it.quantity - q})` : ''}` } });
        }
        await tx.stockTransferItem.update({ where: { id: it.id }, data: { quantityReceived: q, receiveNote: lineNote } });
      }
      await logAudit({ tx, userId: req.user?.id, storeId: existing.toStoreId, action: 'STOCK_TRANSFER_RECEIVE', module: 'stock-transfers', entityId: id, entityType: 'StockTransfer', newValue: { status: 'RECEIVED', gaps: gaps.map((p) => ({ itemId: p.it.id, sent: p.it.quantity, received: p.q })), note: note || null }, ip: req.ip });
      return tx.stockTransfer.findUnique({ where: { id }, include: inc });
    }, { timeout: 30000, maxWait: 10000 });
    res.json(out);
  } catch (err) { next(err); }
});

// Annulation : en attente (rien a remettre) ou expedie (retour du stock a la source)
router.patch('/:id/cancel', guard, async (req, res, next) => {
  try {
    const { id } = req.params;
    const reason = String(req.body.reason || '').trim();
    const out = await prisma.$transaction(async (tx) => {
      const existing = await tx.stockTransfer.findUnique({ where: { id }, include: { items: true } });
      if (!existing) throw httpErr('Transfert introuvable.', 404);
      if (!['PENDING', 'SHIPPED'].includes(existing.status)) throw httpErr('Seuls les transferts en attente ou expédiés peuvent être annulés.');
      await assertStoreAccess(req.user, existing.fromStoreId);
      const g = await tx.stockTransfer.updateMany({ where: { id, status: existing.status }, data: { status: 'CANCELLED', notes: reason || existing.notes } });
      if (g.count === 0) throw httpErr('Ce transfert a déjà été traité.');
      if (existing.status === 'SHIPPED') {
        for (const it of existing.items) {
          await adjustStock(tx, { storeId: existing.fromStoreId, productId: it.productId, variantId: it.variantId || null, delta: it.quantity });
          await tx.stockMovement.create({ data: { storeId: existing.fromStoreId, productId: it.productId, variantId: it.variantId || null, type: 'TRANSFER_IN', quantity: it.quantity, transferId: id, createdBy: req.user?.id, reason: `Annulation ${existing.transferNumber} : retour en stock` } });
        }
      }
      await logAudit({ tx, userId: req.user?.id, storeId: existing.fromStoreId, action: 'STOCK_TRANSFER_CANCEL', module: 'stock-transfers', entityId: id, entityType: 'StockTransfer', newValue: { status: 'CANCELLED', wasShipped: existing.status === 'SHIPPED', reason }, ip: req.ip });
      return tx.stockTransfer.findUnique({ where: { id }, include: inc });
    }, { timeout: 30000, maxWait: 10000 });
    res.json(out);
  } catch (err) { next(err); }
});

module.exports = router;