const express = require('express');
const { body } = require('express-validator');
const categoriesController = require('./categories.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const requireAdmin = require('../../middlewares/admin.middleware');
const { apiLimiter } = require('../../middlewares/rateLimit.middleware');
const { checkValidation } = require('../../middlewares/validation.middleware');

const router = express.Router();

/**
 * @swagger
 * /api/categories:
 *   get:
 *     summary: Liste des catégories
 *     tags: [Catégories]
 *     security: []
 *     responses:
 *       200:
 *         description: Liste des catégories
 */
router.get('/', apiLimiter, categoriesController.getCategories);

/**
 * @swagger
 * /api/categories:
 *   post:
 *     summary: Créer une catégorie (Admin)
 *     tags: [Catégories]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             name: Robes
 *             slug: robes
 *             imageUrl: https://example.com/image.jpg
 *     responses:
 *       201:
 *         description: Catégorie créée
 */
router.post('/', authenticate, requireAdmin,
  body('name').notEmpty(),
  body('slug').notEmpty(),
  checkValidation,
  categoriesController.createCategory
);

/**
 * @swagger
 * /api/categories/{id}:
 *   put:
 *     summary: Modifier une catégorie (Admin)
 *     tags: [Catégories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             name: Robes Africaines
 *     responses:
 *       200:
 *         description: Catégorie modifiée
 */
router.put('/:id', authenticate, requireAdmin,
  body('name').optional().notEmpty(),
  body('slug').optional().notEmpty(),
  checkValidation,
  categoriesController.updateCategory
);

/**
 * @swagger
 * /api/categories/{id}:
 *   delete:
 *     summary: Supprimer une catégorie (Admin)
 *     tags: [Catégories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204:
 *         description: Supprimée
 */
router.delete('/:id', authenticate, requireAdmin, categoriesController.deleteCategory);

module.exports = router;