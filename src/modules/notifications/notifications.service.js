const prisma = require('../../config/database');

async function getNotifications(userId) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

async function markAsRead(userId, id) {
  const notif = await prisma.notification.findUnique({ where: { id } });
  if (!notif || notif.userId !== userId) {
    const error = new Error('Notification introuvable.');
    error.status = 404;
    throw error;
  }
  return prisma.notification.update({ where: { id }, data: { isRead: true } });
}

async function markAllAsRead(userId) {
  return prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
}

async function deleteNotification(userId, id) {
  const notif = await prisma.notification.findUnique({ where: { id } });
  if (!notif || notif.userId !== userId) {
    const error = new Error('Notification introuvable.');
    error.status = 404;
    throw error;
  }
  return prisma.notification.delete({ where: { id } });
}

module.exports = { getNotifications, markAsRead, markAllAsRead, deleteNotification };
