const prisma = require('../config/database');
const { releaseReservation } = require('../modules/products/stock.service');
const { logAudit } = require('../services/audit.service');
const { notifyAdmins } = require('../services/notification.service');

const { getSettings } = require('../modules/settings/settings.service');

async function expireDraftReservations() {
  const now = new Date();
  const expiredOrders = await prisma.order.findMany({
    where: {
      status: 'DRAFT',
      reservationExpiresAt: { lte: now },
    },
    include: { items: true },
    take: 100,
  });

  if (!expiredOrders.length) return { expired: 0 };

  let count = 0;
  for (const order of expiredOrders) {
    await prisma.$transaction(async (tx) => {
      await releaseReservation(tx, order.items);
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          paymentStatus: 'REJECTED',
          statusHistory: {
            create: {
              fromStatus: 'DRAFT',
              toStatus: 'CANCELLED',
              message: 'Réservation expirée — brouillon WhatsApp supprimé automatiquement',
            },
          },
        },
      });
      await logAudit({
        tx,
        storeId: order.storeId,
        action: 'RESERVATION_EXPIRED',
        module: 'orders',
        entityId: order.id,
        entityType: 'Order',
        newValue: { orderNumber: order.orderNumber },
      });
    });
    count += 1;
  }

  return { expired: count };
}

async function notifyUpcomingExpirations() {
  const settings = await getSettings();
  const expiryHours = Number(settings.reservation_expiry_hours || 24);
  const warnBeforeHours = Math.max(1, Math.floor(expiryHours / 4));
  const warnThreshold = new Date(Date.now() + warnBeforeHours * 60 * 60 * 1000);

  const upcoming = await prisma.order.findMany({
    where: {
      status: 'DRAFT',
      reservationExpiresAt: { lte: warnThreshold, gt: new Date() },
    },
    select: { id: true, orderNumber: true, storeId: true, reservationExpiresAt: true },
    take: 50,
  });

  for (const order of upcoming) {
    await notifyAdmins({
      type: 'ORDER_CANCELLED',
      title: 'Brouillon WhatsApp bientôt expiré',
      message: `La commande ${order.orderNumber} expire le ${order.reservationExpiresAt?.toLocaleString('fr-FR')}.`,
      link: '/admin/orders?status=DRAFT',
      storeId: order.storeId,
    }).catch(() => {});
  }

  return { warned: upcoming.length };
}

module.exports = { expireDraftReservations, notifyUpcomingExpirations };
