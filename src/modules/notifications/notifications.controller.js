const notificationsService = require('./notifications.service');

async function getNotifications(req, res, next) {
  try {
    const notifs = await notificationsService.getNotifications(req.user.id);
    res.json(notifs);
  } catch (error) { next(error); }
}

async function markAsRead(req, res, next) {
  try {
    const notif = await notificationsService.markAsRead(req.user.id, req.params.id);
    res.json(notif);
  } catch (error) { next(error); }
}

async function markAllAsRead(req, res, next) {
  try {
    await notificationsService.markAllAsRead(req.user.id);
    res.json({ message: 'Toutes les notifications marquées comme lues.' });
  } catch (error) { next(error); }
}

async function deleteNotification(req, res, next) {
  try {
    await notificationsService.deleteNotification(req.user.id, req.params.id);
    res.status(204).end();
  } catch (error) { next(error); }
}

module.exports = { getNotifications, markAsRead, markAllAsRead, deleteNotification };
