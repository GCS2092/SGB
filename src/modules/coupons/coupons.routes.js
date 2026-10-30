const express = require('express');
const { body } = require('express-validator');
const couponsController = require('./coupons.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const requireAdmin = require('../../middlewares/admin.middleware');
const { checkValidation } = require('../../middlewares/validation.middleware');

const router = express.Router();

/**
 * @swagger
 * /api/coupons/public/active:
 *   get:
 *     summary: Coupons actifs affichés sur le site (public)
 *     tags: [Coupons]
 *     security: []
 *     responses:
 *       200:
 *         description: Liste des coupons publics actifs
 */
router.get('/public/active', couponsController.getPublicCoupons);

/**
 * @swagger
 * /api/coupons/validate:
 *   post:
 *     summary: Valider un code promo
 *     tags: [Coupons]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             code: URBAN10
 *             orderAmount: 25000
 *     responses:
 *       200:
 *         description: Coupon valide + montant de réduction
 */
router.post('/validate',
  body('code').notEmpty(),
  body('orderAmount').isInt({ min: 0 }),
  checkValidation,
  couponsController.validateCoupon
);

/**
 * @swagger
 * /api/coupons:
 *   get:
 *     summary: Tous les coupons (Admin)
 *     tags: [Coupons]
 *     responses:
 *       200:
 *         description: Liste des coupons
 */
router.get('/', authenticate, requireAdmin, couponsController.getCoupons);

/**
 * @swagger
 * /api/coupons:
 *   post:
 *     summary: Créer un coupon (Admin)
 *     tags: [Coupons]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             code: PROMO20
 *             type: PERCENTAGE
 *             value: 20
 *             minOrderAmount: 15000
 *             maxUses: 50
 *             expiresAt: "2025-12-31"
 *     responses:
 *       201:
 *         description: Coupon créé
 */
router.post('/', authenticate, requireAdmin,
  body('code').notEmpty(),
  body('type').isIn(['PERCENTAGE', 'FIXED']),
  body('value').isInt({ min: 1 }),
  checkValidation,
  couponsController.createCoupon
);

/**
 * @swagger
 * /api/coupons/{id}:
 *   put:
 *     summary: Modifier un coupon (Admin)
 *     tags: [Coupons]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Coupon modifié
 */
router.put('/:id', authenticate, requireAdmin, couponsController.updateCoupon);

/**
 * @swagger
 * /api/coupons/{id}:
 *   delete:
 *     summary: Supprimer un coupon (Admin)
 *     tags: [Coupons]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204:
 *         description: Supprimé
 */
router.delete('/:id', authenticate, requireAdmin, couponsController.deleteCoupon);

module.exports = router;