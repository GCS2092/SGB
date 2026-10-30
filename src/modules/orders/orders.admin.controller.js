const prisma = require('../../config/database');
const { notifyOrderStatus, notifyPaymentReceived, notifyOrderConfirmed } = require('../../services/notification.service');
const { fulfillOrderPayment } = require('./order-fulfillment.service');
const { buildOrdersWhere, createOrder } = require('./orders.service');
const { parsePagination, buildPaginationResponse } = require('../../utils/pagination.utils');
const { releaseReservation } = require('../products/stock.service');
const { logAudit } = require('../../services/audit.service');
const { buildProductStoreFilter, resolveStoreIdForCatalog } = require('../stores/store.service');

async function getOrdersAdmin(req, res, next) {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const where = buildOrdersWhere(req.query, req.storeIds);

    const isTodoView = req.query.view === 'todo';
    let orderBy = { createdAt: 'desc' };

    if (isTodoView) {
      const todoCondition = {
        OR: [
          { status: 'DRAFT' },
          { status: 'PENDING', paymentStatus: { in: ['PENDING', 'PARTIAL'] } },
        ],
      };

      if (where.OR) {
        where.AND = [...(where.AND || []), { OR: where.OR }, todoCondition];
        delete where.OR;
      } else {
        Object.assign(where, todoCondition);
      }

      orderBy = [{ reservationExpiresAt: 'asc' }, { createdAt: 'asc' }];
    }

    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          store: { select: { id: true, code: true, name: true } },
          user: {
            select: { id: true, firstName: true, lastName: true, email: true, phone: true },
          },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  supplier: { select: { id: true, name: true, phone: true } },
                },
              },
            },
          },
          payments: true,
          invoice: true,
          statusHistory: { orderBy: { createdAt: 'desc' }, take: 3 },
        },
      }),
    ]);

    res.json(buildPaginationResponse({ data: orders, total, page, limit }));
  } catch (err) {
    next(err);
  }
}

async function updatePaymentStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { paymentStatus, note } = req.body;

    if (!['PAID', 'REJECTED', 'PENDING', 'PARTIAL'].includes(paymentStatus)) {
      return res.status(400).json({ message: 'Statut de paiement invalide.' });
    }

    const order = await fulfillOrderPayment(
      id,
      { paymentStatus, note },
      req.user,
      req.ip,
    );

    if (order.user) {
      const message =
        paymentStatus === 'PAID'
          ? `Votre paiement pour la commande ${order.orderNumber} a été validé.`
          : paymentStatus === 'REJECTED'
            ? `Votre paiement pour la commande ${order.orderNumber} a été rejeté. ${note || ''}`
            : `Votre paiement pour la commande ${order.orderNumber} est en attente.`;

      await prisma.notification.create({
        data: {
          userId: order.user.id,
          type: paymentStatus === 'PAID' ? 'ORDER_CONFIRMED' : 'ORDER_CANCELLED',
          title:
            paymentStatus === 'PAID'
              ? 'Paiement validé'
              : paymentStatus === 'REJECTED'
                ? 'Paiement rejeté'
                : 'Paiement en attente',
          message,
          link: `/orders/${order.orderNumber}`,
        },
      });

      if (paymentStatus === 'PAID') {
        await notifyPaymentReceived(order);
      } else {
        await notifyOrderStatus(order, paymentStatus === 'REJECTED' ? 'CANCELLED' : 'CONFIRMED');
      }
    }

    res.json(order);
  } catch (err) {
    next(err);
  }
}

async function confirmDraftOrder(req, res, next) {
  try {
    const { id } = req.params;

    const existing = await prisma.order.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: 'Commande introuvable' });
    }
    if (existing.status !== 'DRAFT') {
      return res.status(400).json({ message: "La commande n'est pas un brouillon" });
    }

    const order = await prisma.order.update({
      where: { id },
      data: {
        status: 'PENDING',
        statusHistory: {
          create: {
            fromStatus: 'DRAFT',
            toStatus: 'PENDING',
            message: "Commande WhatsApp confirmée par l'admin",
            changedBy: req.user?.id,
          },
        },
      },
      include: { user: true, items: true },
    });

    if (order.user) {
      await prisma.notification.create({
        data: {
          userId: order.user.id,
          type: 'ORDER_CONFIRMED',
          title: 'Commande confirmée',
          message: `Votre commande WhatsApp ${order.orderNumber} a été confirmée.`,
          link: `/orders/${order.orderNumber}`,
        },
      });

      await notifyOrderConfirmed(order);
    }

    res.json(order);
  } catch (err) {
    next(err);
  }
}

async function rejectDraftOrder(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const order = await prisma.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!existing) {
        const error = new Error('Commande introuvable.');
        error.status = 404;
        throw error;
      }
      if (existing.status !== 'DRAFT') {
        const error = new Error('Seules les commandes brouillon WhatsApp peuvent être rejetées.');
        error.status = 400;
        throw error;
      }

      await releaseReservation(tx, existing.items);

      const updated = await tx.order.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          paymentStatus: 'REJECTED',
          statusHistory: {
            create: {
              fromStatus: 'DRAFT',
              toStatus: 'CANCELLED',
              message: 'Commande WhatsApp rejetée',
              reason: reason || null,
              changedBy: req.user?.id,
            },
          },
        },
        include: { items: true, store: true },
      });

      await logAudit({
        tx,
        userId: req.user?.id,
        storeId: existing.storeId,
        action: 'ORDER_DRAFT_REJECT',
        module: 'orders',
        entityId: id,
        entityType: 'Order',
        newValue: { status: 'CANCELLED' },
        ip: req.ip,
      });

      return updated;
    });

    await notifyOrderStatus(order, 'CANCELLED');

    res.json(order);
  } catch (err) {
    next(err);
  }
}

async function createManualOrder(req, res, next) {
  try {
    const order = await createOrder(req.body, req.user, req.ip);
    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
}

async function searchUsers(req, res, next) {
  try {
    const { q = '' } = req.query;
    const users = await prisma.user.findMany({
      where: q.trim()
        ? {
            OR: [
              { firstName: { contains: q } },
              { lastName: { contains: q } },
              { email: { contains: q } },
              { phone: { contains: q } },
            ],
          }
        : {},
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (err) {
    next(err);
  }
}

async function searchProducts(req, res, next) {
  try {
    const { q = '', categoryId, storeId } = req.query;
    const effectiveStoreId = storeId
      || (req.storeIds?.length === 1 ? req.storeIds[0] : null)
      || (await resolveStoreIdForCatalog(null));

    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        ...buildProductStoreFilter(effectiveStoreId),
        ...(categoryId && { categoryId }),
        ...(q.trim() && {
          OR: [
            { name: { contains: q } },
          ],
        }),
      },
      include: {
        images: { take: 1 },
        variants: true,
        category: { select: { id: true, name: true } },
      },
      take: 20,
      orderBy: { name: 'asc' },
    });

    res.json(products);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getOrdersAdmin,
  updatePaymentStatus,
  confirmDraftOrder,
  rejectDraftOrder,
  createManualOrder,
  searchUsers,
  searchProducts,
};