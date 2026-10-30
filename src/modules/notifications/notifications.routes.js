const express = require('express');
const notificationsController = require('./notifications.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

const router = express.Router();
router.use(authenticate);

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Mes notifications
 *     tags: [Notifications]
 *     responses:
 *       200:
 *         description: Liste des notifications
 */
router.get('/', notificationsController.getNotifications);

/**
 * @swagger
 * /api/notifications/read-all:
 *   put:
 *     summary: Tout marquer comme lu
 *     tags: [Notifications]
 *     responses:
 *       200:
 *         description: Toutes lues
 */
router.put('/read-all', notificationsController.markAllAsRead);

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   put:
 *     summary: Marquer une notification comme lue
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Notification lue
 */
router.put('/:id/read', notificationsController.markAsRead);

/**
 * @swagger
 * /api/notifications/{id}:
 *   delete:
 *     summary: Supprimer une notification
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204:
 *         description: Supprimée
 */
router.delete('/:id', notificationsController.deleteNotification);

module.exports = router;
