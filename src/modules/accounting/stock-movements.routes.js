const express = require('express');
const prisma = require('../../config/database');
const { isAdmin } = require('../../middlewares/auth.middleware');
const { applyStoreIdToWhere } = require('../../utils/store-scope.utils');
const { applyMovement } = require('../products/stock.service');
const { logAudit } = require('../../services/audit.service');

const router = express.Router();

const MANUAL_TYPES = ['IN', 'OUT_LOSS', 'OUT_RETURN', 'RETURN_IN', 'ADJUSTMENT', 'ADJUSTMENT_OUT'];
const REASON_REQUIRED = ['OUT_LOSS', 'OUT_RETURN', 'ADJUSTMENT', 'ADJUSTMENT_OUT'];
const ALL_TYPES = [...MANUAL_TYPES, 'OUT_SALE', 'TRANSFER_OUT', 'TRANSFER_IN'];

function sendError(res, tag, error) {
  const status = error.status || 500;
  if (status >= 500) console.error(tag, error);
  res.status(status).json({ error: status >= 500 ? 'Erreur serveur' : error.message });
}

// GET /api/admin/accounting/stock-movements  (filtres : productId, type, startDate, endDate, storeId)
router.get('/stock-movements', isAdmin, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const { productId, type, storeId, startDate, endDate } = req.query;
    if (type && !ALL_TYPES.includes(type)) return res.status(400).json({ error: 'Type de mouvement invalide' });

    const where = {};
    if (productId) where.productId = productId;
    if (type) where.type = type;
    applyStoreIdToWhere(where, storeId);

    const range = {};
    if (startDate) { const d = new Date(startDate); if (!isNaN(d)) { d.setHours(0, 0, 0, 0); range.gte = d; } }
    if (endDate) { const d = new Date(endDate); if (!isNaN(d)) { d.setHours(23, 59, 59, 999); range.lte = d; } }
    if (Object.keys(range).length) where.createdAt = range;

    const [movements, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        include: {
          product: { select: { name: true, slug: true } },
          variant: { select: { size: true, color: true } },
          supplier: { select: { name: true } },
          store: { select: { name: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.stockMovement.count({ where }),
    ]);

    res.json({ movements, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error) {
    sendError(res, '[stock-movements GET]', error);
  }
});

// POST /api/admin/accounting/stock-movements
router.post('/stock-movements', isAdmin, async (req, res) => {
  try {
    const { productId, variantId, type, quantity, unitCost, reason, supplierId, reference, orderId, storeId } = req.body;

    if (!productId || !type || !quantity) return res.status(400).json({ error: 'productId, type et quantity sont requis' });
    if (!storeId) return res.status(400).json({ error: 'storeId est requis pour identifier la boutique' });
    if (!MANUAL_TYPES.includes(type)) return res.status(400).json({ error: 'Type de mouvement non autorisé en saisie manuelle' });

    const qtyN = Number(quantity);
    if (!Number.isInteger(qtyN) || qtyN <= 0) return res.status(400).json({ error: 'La quantité doit être un entier positif' });

    const cleanReason = reason ? String(reason).trim() : '';
    if (REASON_REQUIRED.includes(type) && cleanReason.length < 3) {
      return res.status(400).json({ error: 'Un motif (3 caractères minimum) est obligatoire pour ce type de mouvement' });
    }

    const costN = unitCost ? Number(unitCost) : null;
    if (costN !== null && (!Number.isFinite(costN) || costN < 0)) return res.status(400).json({ error: 'Coût unitaire invalide' });

    const movement = await prisma.$transaction(async (tx) => {
      const m = await applyMovement(tx, {
        storeId, productId, variantId: variantId || null, type, quantity: qtyN, unitCost: costN,
        reason: cleanReason || null, supplierId: supplierId || null, reference: reference || null,
        orderId: orderId || null, createdBy: req.user.id,
      });
      await logAudit({
        tx, userId: req.user.id, storeId, action: 'STOCK_MOVEMENT', module: 'stock',
        entityId: m.id, entityType: 'StockMovement',
        newValue: { type, quantity: qtyN, reason: cleanReason || null, productId, variantId: variantId || null },
        ip: req.ip,
      });
      return m;
    });

    if (type === 'IN' && costN) {
      await prisma.product.update({ where: { id: productId }, data: { purchasePrice: costN } });
    }

    res.json(movement);
  } catch (error) {
    sendError(res, '[stock-movements POST]', error);
  }
});

module.exports = router;