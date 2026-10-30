const prisma = require('../../config/database');
const { nextCreditNoteNumber } = require('../../utils/invoice.utils');
const { logAudit } = require('../../services/audit.service');
const { restoreStockFromSale } = require('../products/stock.service');

async function createCreditNote(req, res, next) {
  try {
    const { invoiceId, amount, reason } = req.body;

    if (!invoiceId || !amount) {
      return res.status(400).json({ message: 'Facture et montant requis.' });
    }

    const creditNote = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { order: { include: { items: true, store: true } } },
      });

      if (!invoice) {
        const error = new Error('Facture introuvable.');
        error.status = 404;
        throw error;
      }
      if (invoice.status === 'CANCELLED') {
        const error = new Error('Impossible d\'émettre un avoir sur une facture annulée.');
        error.status = 400;
        throw error;
      }

      const store = invoice.order.store || await tx.store.findUnique({ where: { id: invoice.storeId } });
      const creditNoteNumber = await nextCreditNoteNumber(tx, store);

      const created = await tx.creditNote.create({
        data: {
          creditNoteNumber,
          invoiceId,
          storeId: invoice.storeId,
          amount: Number(amount),
          reason: reason || null,
          createdBy: req.user?.id,
        },
      });

      if (req.body.restoreStock && invoice.order?.items?.length) {
        await restoreStockFromSale(tx, invoice.order.items, invoice.orderId, req.user?.id);
      }

      await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: 'CANCELLED' },
      });

      await logAudit({
        tx,
        userId: req.user?.id,
        storeId: invoice.storeId,
        action: 'CREDIT_NOTE_CREATE',
        module: 'credit-notes',
        entityId: created.id,
        entityType: 'CreditNote',
        newValue: { creditNoteNumber, amount },
        ip: req.ip,
      });

      return created;
    });

    res.status(201).json(creditNote);
  } catch (err) {
    next(err);
  }
}

async function listCreditNotes(req, res, next) {
  try {
    const where = {};
    if (req.query.storeId) where.storeId = req.query.storeId;
    else if (req.storeIds?.length) where.storeId = { in: req.storeIds };

    const notes = await prisma.creditNote.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        invoice: { select: { invoiceNumber: true, order: { select: { orderNumber: true } } } },
        store: { select: { code: true, name: true } },
      },
      take: 100,
    });

    res.json(notes);
  } catch (err) {
    next(err);
  }
}

module.exports = { createCreditNote, listCreditNotes };
