const express = require('express');
const wishlistController = require('./wishlist.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

const router = express.Router();
router.use(authenticate);

/**
 * @swagger
 * /api/wishlist:
 *   get:
 *     summary: Mes favoris
 *     tags: [Wishlist]
 *     responses:
 *       200:
 *         description: Liste des favoris
 */
router.get('/', wishlistController.getWishlist);

/**
 * @swagger
 * /api/wishlist:
 *   post:
 *     summary: Ajouter aux favoris
 *     tags: [Wishlist]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             productId: "clxxxxxx"
 *     responses:
 *       201:
 *         description: Ajouté aux favoris
 */
router.post('/', wishlistController.addToWishlist);

/**
 * @swagger
 * /api/wishlist/{productId}:
 *   delete:
 *     summary: Retirer des favoris
 *     tags: [Wishlist]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204:
 *         description: Retiré
 */
router.delete('/:productId', wishlistController.removeFromWishlist);

module.exports = router;
