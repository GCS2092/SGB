const prisma = require('../../config/database');
const { nextTransferNumber } = require('../../utils/invoice.utils');
const { logAudit } = require('../../services/audit.service');
const { assertStoreAccess } = require('../stores/store.service');

async function listTransfers(req, res, next) {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.storeId) {
      where.OR = [
        { fromStoreId: req.query.storeId },
        { toStoreId: req.query.storeId },
      ];
    } else if (req.storeIds?.length) {
      where.OR = [
        { fromStoreId: { in: req.storeIds } },
        { toStoreId: { in: req.storeIds } },
      ];
    }

    const transfers = await prisma.stockTransfer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        fromStore: { select: { id: true, code: true, name: true } },
        toStore:   { select: { id: true, code: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true } },
            variant: { select: { id: true, size: true, color: true } },
          },
        },
      },
      take: 100,
    });

    res.json(transfers);
  } catch (err) {
    next(err);
  }
}

async function createTransfer(req, res, next) {
  try {
    const { fromStoreId, toStoreId, items, notes } = req.body;

    if (!fromStoreId || !toStoreId || fromStoreId === toStoreId) {
      return res.status(400).json({ message: 'Boutiques source et destination invalides.' });
    }
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ message: 'Au moins un produit est requis.' });
    }

    await assertStoreAccess(req.user, fromStoreId);

    const transfer = await prisma.$transaction(async (tx) => {
      const transferNumber = await nextTransferNumber(tx);
      const created = await tx.stockTransfer.create({
        data: {
          transferNumber,
          fromStoreId,
          toStoreId,
          notes:     notes || null,
          createdBy: req.user?.id,
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              variantId: item.variantId || null,
              quantity:  item.quantity,
            })),
          },
        },
        include: { items: true, fromStore: true, toStore: true },
      });

      await logAudit({
        tx,
        userId:     req.user?.id,
        storeId:    fromStoreId,
        action:     'STOCK_TRANSFER_CREATE',
        module:     'stock-transfers',
        entityId:   created.id,
        entityType: 'StockTransfer',
        newValue:   { transferNumber },
        ip:         req.ip,
      });

      return created;
    });

    res.status(201).json(transfer);
  } catch (err) {
    next(err);
  }
}

async function validateTransfer(req, res, next) {
  try {
    const { id } = req.params;

    const transfer = await prisma.$transaction(async (tx) => {
      const existing = await tx.stockTransfer.findUnique({
        where:   { id },
        include: { items: true },
      });

      if (!existing) {
        const error = new Error('Transfert introuvable.');
        error.status = 404;
        throw error;
      }
      if (existing.status !== 'PENDING') {
        const error = new Error('Ce transfert a déjà été traité.');
        error.status = 400;
        throw error;
      }

      // ── Vérification stock disponible AVANT toute écriture ──────────
      for (const item of existing.items) {
        if (item.variantId) {
          const variant = await tx.productVariant.findUnique({ where: { id: item.variantId } });
          const available = Math.max(0, variant.stock - (variant.reservedStock || 0));
          if (available < item.quantity) {
            const error = new Error(
              `Stock insuffisant pour la variante ${item.variantId} — disponible : ${available}`
            );
            error.status = 400;
            throw error;
          }
        } else {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          const available = Math.max(0, product.stock - (product.reservedStock || 0));
          if (available < item.quantity) {
            const error = new Error(
              `Stock insuffisant pour le produit ${product.name} — disponible : ${available}`
            );
            error.status = 400;
            throw error;
          }
        }
      }

      // ── Mouvements de stock ──────────────────────────────────────────
      for (const item of existing.items) {
        // 1. Décrémente la boutique SOURCE
        if (item.variantId) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data:  { stock: { decrement: item.quantity } },
          });
        } else {
          await tx.product.update({
            where: { id: item.productId },
            data:  { stock: { decrement: item.quantity } },
          });
        }

        // 2. ✅ Incrémente la boutique DESTINATION (bug corrigé)
        if (item.variantId) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data:  { stock: { increment: item.quantity } },
          });
        } else {
          await tx.product.update({
            where: { id: item.productId },
            data:  { stock: { increment: item.quantity } },
          });
        }

        // 3. StockMovement TRANSFER_OUT (boutique source)
        await tx.stockMovement.create({
          data: {
            productId:  item.productId,
            variantId:  item.variantId || null,
            type:       'TRANSFER_OUT',
            quantity:   item.quantity,
            storeId:    existing.fromStoreId,
            transferId: existing.id,
            reason:     `Transfert ${existing.transferNumber} → boutique destination`,
            createdBy:  req.user?.id,
          },
        });

        // 4. StockMovement TRANSFER_IN (boutique destination)
        await tx.stockMovement.create({
          data: {
            productId:  item.productId,
            variantId:  item.variantId || null,
            type:       'TRANSFER_IN',
            quantity:   item.quantity,
            storeId:    existing.toStoreId,
            transferId: existing.id,
            reason:     `Transfert ${existing.transferNumber} ← boutique source`,
            createdBy:  req.user?.id,
          },
        });
      }

      // ── Passe le statut à VALIDATED ─────────────────────────────────
      const updated = await tx.stockTransfer.update({
        where: { id },
        data: {
          status:      'VALIDATED',
          validatedBy: req.user?.id,
          validatedAt: new Date(),
        },
        include: {
          fromStore: { select: { id: true, code: true, name: true } },
          toStore:   { select: { id: true, code: true, name: true } },
          items: {
            include: {
              product: { select: { id: true, name: true } },
              variant: { select: { id: true, size: true, color: true } },
            },
          },
        },
      });

      await logAudit({
        tx,
        userId:     req.user?.id,
        storeId:    existing.fromStoreId,
        action:     'STOCK_TRANSFER_VALIDATE',
        module:     'stock-transfers',
        entityId:   existing.id,
        entityType: 'StockTransfer',
        newValue:   { status: 'VALIDATED' },
        ip:         req.ip,
      });

      return updated;
    });

    res.json(transfer);
  } catch (err) {
    next(err);
  }
}

async function cancelTransfer(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const transfer = await prisma.$transaction(async (tx) => {
      const existing = await tx.stockTransfer.findUnique({
        where:   { id },
        include: { items: true },
      });

      if (!existing) {
        const error = new Error('Transfert introuvable.');
        error.status = 404;
        throw error;
      }
      if (existing.status !== 'PENDING') {
        const error = new Error('Seuls les transferts en attente peuvent être annulés.');
        error.status = 400;
        throw error;
      }

      const updated = await tx.stockTransfer.update({
        where: { id },
        data:  { status: 'CANCELLED', notes: reason || existing.notes },
        include: {
          fromStore: { select: { id: true, code: true, name: true } },
          toStore:   { select: { id: true, code: true, name: true } },
          items: true,
        },
      });

      await logAudit({
        tx,
        userId:     req.user?.id,
        storeId:    existing.fromStoreId,
        action:     'STOCK_TRANSFER_CANCEL',
        module:     'stock-transfers',
        entityId:   existing.id,
        entityType: 'StockTransfer',
        newValue:   { status: 'CANCELLED', reason },
        ip:         req.ip,
      });

      return updated;
    });

    res.json(transfer);
  } catch (err) {
    next(err);
  }
}

module.exports = { listTransfers, createTransfer, validateTransfer, cancelTransfer };