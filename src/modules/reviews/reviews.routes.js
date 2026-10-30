const express = require('express');
const { body } = require('express-validator');
const reviewsController = require('./reviews.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { checkValidation } = require('../../middlewares/validation.middleware');

const router = express.Router();

/**
 * @swagger
 * /api/reviews/{productId}:
 *   get:
 *     summary: Avis d'un produit
 *     tags: [Avis]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Liste des avis
 */
router.get('/:productId', reviewsController.getProductReviews);

/**
 * @swagger
 * /api/reviews:
 *   post:
 *     summary: Laisser un avis
 *     tags: [Avis]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             productId: "clxxxxxx"
 *             rating: 5
 *             comment: Très beau produit !
 *     responses:
 *       201:
 *         description: Avis créé
 */
router.post('/', authenticate,
  body('productId').notEmpty(),
  body('rating').isInt({ min: 1, max: 5 }),
  checkValidation,
  reviewsController.createReview
);

/**
 * @swagger
 * /api/reviews/{id}:
 *   delete:
 *     summary: Supprimer un avis
 *     tags: [Avis]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204:
 *         description: Supprimé
 */
router.delete('/:id', authenticate, reviewsController.deleteReview);

module.exports = router;
