const prisma = require('../../config/database');
const { nextInvoiceNumber } = require('../../utils/invoice.utils');
const { logAudit } = require('../../services/audit.service');
const { sendPurchaseEventSafely } = require('../../services/meta-conversions.service');
const {
  fulfillStockSale,
  releaseReservation,
  restoreStockFromSale,
} = require('../products/stock.service');

const TERMINAL_STATUSES = ['DELIVERED', 'CANCELLED'];

// Filet de sécurité : le vrai fix est de raccourcir le travail dans la
// transaction (voir fulfillStockSale optimisé + fetch final sorti), mais on
// garde une marge explicite au cas où la charge DB soit ponctuellement plus
// lente (ex: contention sur InvoiceSequence en cas de paiements simultanés).
const TX_TIMEOUT_MS = 10000;
const TX_MAX_WAIT_MS = 5000;

async function recordStatusHistory(tx, {
  orderId,
  fromStatus,
  toStatus,
  message,
  reason,
  changedBy,
}) {
  return tx.orderStatusHistory.create({
    data: {
      orderId,
      fromStatus: fromStatus ?? null,
      toStatus,
      message,
      reason,
      changedBy,
    },
  });
}

async function createInvoiceForOrder(tx, order) {
  const existing = await tx.invoice.findUnique({ where: { orderId: order.id } });
  if (existing) return existing;

  const store = await tx.store.findUnique({ where: { id: order.storeId } });
  const invoiceNumber = await nextInvoiceNumber(tx, store);
  const taxableBase = order.subtotal - order.discount - (order.storeDiscount || 0);
  const tax = store ? Math.floor(taxableBase * (store.taxRate / 100)) : 0;

  return tx.invoice.create({
    data: {
      invoiceNumber,
      orderId: order.id,
      storeId: order.storeId,
      subtotal: order.subtotal,
      shippingCost: order.shippingCost,
      discount: order.discount,
      storeDiscount: order.storeDiscount || 0,
      tax,
      total: order.total,
      status: 'GENERATED',
    },
  });
}

// ─── include réutilisable pour avoir invoice.order.items ───────────────────────
const invoiceWithOrderInclude = {
  include: {
    order: {
      include: { items: true },
    },
  },
};

// ─── include pour la relecture finale (identique à avant, mais utilisé hors tx)
const orderFullInclude = {
  user: { select: { id: true, firstName: true, lastName: true, email: true } },
  payments: true,
  items: true,
  tracking: { orderBy: { createdAt: 'asc' } },
  invoice: invoiceWithOrderInclude,
  statusHistory: { orderBy: { createdAt: 'desc' }, take: 5 },
};

async function fulfillOrderPayment(orderId, { paymentStatus, note }, adminUser, ip) {
  // ⚡ Le findUnique final (lecture pure, aucune garantie transactionnelle
  // requise) a été sorti de la transaction pour libérer le verrou DB
  // (notamment celui posé par nextInvoiceNumber sur InvoiceSequence) le plus
  // tôt possible, réduisant la fenêtre de contention pour les transactions
  // concurrentes.
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true, user: true, invoice: true },
    });

    if (!order) {
      const error = new Error('Commande introuvable.');
      error.status = 404;
      throw error;
    }

    const wasPaid = order.paymentStatus === 'PAID';
    const willBePaid = paymentStatus === 'PAID';
    const willBeRejected = paymentStatus === 'REJECTED';
    const willBePending = paymentStatus === 'PENDING';

    if (wasPaid && willBePaid) {
      const error = new Error('Cette commande est déjà payée.');
      error.status = 400;
      throw error;
    }

    // ── Stock/facture : garde l'ordre séquentiel ici, car fulfillStockSale et
    // createInvoiceForOrder peuvent toucher les mêmes lignes produit/stock —
    // les paralléliser risquerait des écritures concurrentes incohérentes.
    if (willBePaid && !wasPaid) {
      await fulfillStockSale(tx, order.items, order.id, adminUser?.id, order.storeId);
      await createInvoiceForOrder(tx, order);
    }

    if (wasPaid && (willBeRejected || willBePending)) {
      await restoreStockFromSale(tx, order.items, order.id, adminUser?.id);
      if (order.invoice) {
        await tx.invoice.update({
          where: { id: order.invoice.id },
          data: { status: 'CANCELLED' },
        });
      }
    }

    if (!wasPaid && willBeRejected) {
      await releaseReservation(tx, order.items);
    }

    const newOrderStatus = willBePaid
      ? 'CONFIRMED'
      : willBeRejected
        ? 'CANCELLED'
        : order.status === 'CANCELLED'
          ? 'PENDING'
          : order.status;

    // 1. mise à jour "légère" du statut — doit précéder le reste (les autres
    // écritures ne dépendent pas de son résultat, mais on garde la commande
    // cohérente dès que possible en cas d'erreur ultérieure)
    await tx.order.update({
      where: { id: orderId },
      data: { paymentStatus, status: newOrderStatus },
    });

    // 2. paiement — lecture nécessaire avant upsert (doit rester à part)
    const payment = await tx.payment.findFirst({ where: { orderId } });

    // 3. écritures indépendantes entre elles → en parallèle
    // (tracking, historique, paiement, audit ne se lisent pas mutuellement)
    await Promise.all([
      tx.orderTracking.create({
        data: {
          orderId: order.id,
          status: newOrderStatus,
          message:
            paymentStatus === 'PAID'
              ? 'Paiement validé — commande confirmée.'
              : paymentStatus === 'REJECTED'
                ? `Paiement rejeté. ${note || ''}`.trim()
                : `Paiement remis en attente. ${note || ''}`.trim(),
        },
      }),
      recordStatusHistory(tx, {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: newOrderStatus,
        message: `Paiement : ${order.paymentStatus} → ${paymentStatus}`,
        reason: note || null,
        changedBy: adminUser?.id,
      }),
      payment
        ? tx.payment.update({
            where: { id: payment.id },
            data: {
              status: paymentStatus,
              paidAt: paymentStatus === 'PAID' ? new Date() : null,
            },
          })
        : tx.payment.create({
            data: {
              orderId: order.id,
              method: order.paymentMethod,
              status: paymentStatus,
              amount: order.total,
              paidAt: paymentStatus === 'PAID' ? new Date() : null,
            },
          }),
      logAudit({
        tx,
        userId: adminUser?.id,
        storeId: order.storeId,
        action: 'PAYMENT_STATUS_UPDATE',
        module: 'orders',
        entityId: order.id,
        entityType: 'Order',
        oldValue: { paymentStatus: order.paymentStatus, status: order.status },
        newValue: { paymentStatus, status: newOrderStatus },
        ip,
      }),
    ]);
    // Fin de la transaction : plus de findUnique ici, voir plus bas.
  }, {
    timeout: TX_TIMEOUT_MS,
    maxWait: TX_MAX_WAIT_MS,
  });

  if (paymentStatus === 'PAID') {
    // Même règle pour les paiements à la livraison validés manuellement.
    await sendPurchaseEventSafely(orderId);
  }

  // Relecture complète hors transaction : aucune garantie d'atomicité requise
  // ici, c'est une simple lecture pour construire la réponse HTTP.
  return prisma.order.findUnique({
    where: { id: orderId },
    include: orderFullInclude,
  });
}

function assertStatusChangeAllowed(currentStatus, newStatus) {
  if (currentStatus === newStatus) return;

  if (TERMINAL_STATUSES.includes(currentStatus)) {
    const error = new Error(
      `Impossible de modifier une commande au statut « ${currentStatus} ».`,
    );
    error.status = 400;
    throw error;
  }

  const editable = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED'];
  if (!editable.includes(currentStatus) && newStatus !== 'CANCELLED') {
    const error = new Error('Cette commande ne peut plus être modifiée.');
    error.status = 400;
    throw error;
  }
}

async function changeOrderStatusAtomic(orderId, payload, adminUser, ip) {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true, user: true, invoice: true },
    });

    if (!order) {
      const error = new Error('Commande introuvable.');
      error.status = 404;
      throw error;
    }

    assertStatusChangeAllowed(order.status, payload.status);

    if (payload.status === 'CANCELLED') {
      if (order.paymentStatus === 'PAID') {
        await restoreStockFromSale(tx, order.items, order.id, adminUser?.id);
        if (order.invoice) {
          await tx.invoice.update({
            where: { id: order.invoice.id },
            data: { status: 'CANCELLED' },
          });
        }
      } else {
        await releaseReservation(tx, order.items);
      }
    }

    // 1. on met à jour le statut (sans include lourd)
    await tx.order.update({
      where: { id: orderId },
      data: { status: payload.status },
    });

    // 2. écritures indépendantes entre elles → en parallèle
    await Promise.all([
      tx.orderTracking.create({
        data: {
          orderId: order.id,
          status: payload.status,
          message: payload.message || `Statut changé en ${payload.status}`,
          location: payload.location || null,
        },
      }),
      recordStatusHistory(tx, {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: payload.status,
        message: payload.message,
        reason: payload.reason,
        changedBy: adminUser?.id,
      }),
      logAudit({
        tx,
        userId: adminUser?.id,
        storeId: order.storeId,
        action: 'ORDER_STATUS_UPDATE',
        module: 'orders',
        entityId: order.id,
        entityType: 'Order',
        oldValue: { status: order.status },
        newValue: { status: payload.status },
        ip,
      }),
    ]);
    // Fin de la transaction : plus de findUnique ici, voir plus bas.
  }, {
    timeout: TX_TIMEOUT_MS,
    maxWait: TX_MAX_WAIT_MS,
  });

  // 3. relecture complète, hors transaction, EN DERNIER
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      tracking: { orderBy: { createdAt: 'asc' } },
      user: true,
      items: true,
      invoice: invoiceWithOrderInclude,
      statusHistory: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  });
}

module.exports = {
  fulfillOrderPayment,
  changeOrderStatusAtomic,
  recordStatusHistory,
  createInvoiceForOrder,
};
