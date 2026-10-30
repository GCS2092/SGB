const express = require('express');
const { body } = require('express-validator');
const productsController = require('./products.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const requireAdmin = require('../../middlewares/admin.middleware');
const requireStaff = require('../../middlewares/staff.middleware');
const { apiLimiter } = require('../../middlewares/rateLimit.middleware');
const { checkValidation } = require('../../middlewares/validation.middleware');
const { loadStoreContext } = require('../../middlewares/store.middleware');
const { excelUploadMiddleware } = require('../../middlewares/excel.middleware');

const router = express.Router();

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Liste des produits (avec filtres)
 *     tags: [Produits]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *         description: Slug de la catégorie
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: minPrice
 *         schema: { type: integer }
 *       - in: query
 *         name: maxPrice
 *         schema: { type: integer }
 *       - in: query
 *         name: size
 *         schema: { type: string }
 *         description: Tailles séparées par virgule, ex "M,L"
 *       - in: query
 *         name: color
 *         schema: { type: string }
 *         description: Couleurs séparées par virgule
 *       - in: query
 *         name: inStock
 *         schema: { type: boolean }
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [newest, price_asc, price_desc, name_asc] }
 *     responses:
 *       200:
 *         description: Liste paginée
 */
router.get('/', apiLimiter, productsController.getProducts);

/**
 * @swagger
 * /api/products/filters:
 *   get:
 *     summary: Options de filtres disponibles (tailles, couleurs, prix min/max)
 *     tags: [Produits]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: "{ priceMin, priceMax, sizes[], colors[] }"
 */
// ⚠️ DOIT être avant /:slug pour ne pas être capturé comme slug
router.get('/filters', apiLimiter, productsController.getProductFilters);

/**
 * @swagger
 * /api/products/admin/all:
 *   get:
 *     summary: Liste tous les produits sans filtre isActive (Admin/Staff)
 *     tags: [Produits]
 *     responses:
 *       200:
 *         description: Liste paginée — actifs + inactifs
 */
// ⚠️ DOIT être avant /:slug pour ne pas être capturé comme slug
router.get('/admin/all', authenticate, requireStaff, loadStoreContext, productsController.getAllProductsAdmin);

// ─── Import / Export Excel ──────────────────────────────────────────
// ⚠️ DOIVENT être avant /:slug pour ne pas être capturés comme slug ("import", "export")

/**
 * @swagger
 * /api/products/import/template:
 *   get:
 *     summary: Télécharger le template Excel vierge (Admin)
 *     tags: [Produits]
 *     responses:
 *       200:
 *         description: Fichier .xlsx avec feuilles Produits, Variantes, Ref_Categories, Ref_Boutiques
 */
router.get('/import/template', authenticate, requireAdmin, productsController.downloadTemplate);

/**
 * @swagger
 * /api/products/export:
 *   get:
 *     summary: Exporter le catalogue actuel en Excel (Admin)
 *     tags: [Produits]
 *     responses:
 *       200:
 *         description: Fichier .xlsx avec le catalogue complet
 */
router.get('/export', authenticate, requireAdmin, productsController.exportProducts);

/**
 * @swagger
 * /api/products/import:
 *   post:
 *     summary: Importer des produits depuis un fichier Excel (Admin)
 *     tags: [Produits]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Rapport d'import { total, created, updated, skipped, errors[] }
 */
router.post(
  '/import',
  authenticate, requireAdmin,
  excelUploadMiddleware.single('file'),
  productsController.importProducts
);

/**
 * @swagger
 * /api/products/feed/pinterest.xml:
 *   get:
 *     summary: Flux XML du catalogue pour Pinterest Catalogs (public, sans auth)
 *     tags: [Produits]
 *     security: []
 *     responses:
 *       200:
 *         description: Fichier XML au format Google/Pinterest product feed
 */
// ⚠️ DOIT être avant /:slug pour ne pas être capturé comme slug
router.get('/feed/pinterest.xml', productsController.getPinterestFeed);

/**
 * @swagger
 * /api/products/{slug}:
 *   get:
 *     summary: Détail d'un produit par slug
 *     tags: [Produits]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *         example: robe-wax-elegante
 *     responses:
 *       200:
 *         description: Produit trouvé
 *       404:
 *         description: Produit introuvable
 */
router.get('/:slug', apiLimiter, productsController.getProductBySlug);

/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Créer un produit (Admin)
 *     tags: [Produits]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             name: Robe Wax
 *             slug: robe-wax
 *             description: Belle robe en wax
 *             price: 25000
 *             stock: 10
 *             categoryId: "clxxxxxx"
 *             purchasePrice: 15000
 *     responses:
 *       201:
 *         description: Produit créé
 */
router.post('/', authenticate, requireAdmin,
  body('name').notEmpty(),
  body('slug').notEmpty(),
  body('description').optional().notEmpty(),
  body('price').isInt({ min: 0 }),
  body('stock').isInt({ min: 0 }),
  body('categoryId').optional().notEmpty(),
  body('purchasePrice').optional({ nullable: true }).isInt({ min: 0 }),
  checkValidation,
  productsController.createProduct
);

/**
 * @swagger
 * /api/products/{id}:
 *   put:
 *     summary: Modifier un produit (Admin)
 *     tags: [Produits]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             price: 30000
 *             stock: 15
 *             purchasePrice: 15000
 *     responses:
 *       200:
 *         description: Produit modifié
 */
router.put('/:id', authenticate, requireAdmin,
  body('name').optional().notEmpty(),
  body('description').optional().notEmpty(),
  body('price').optional().isInt({ min: 0 }),
  body('stock').optional().isInt({ min: 0 }),
  body('categoryId').optional().notEmpty(),
  body('purchasePrice').optional({ nullable: true }).isInt({ min: 0 }),
  checkValidation,
  productsController.updateProduct
);

/**
 * @swagger
 * /api/products/{id}/supplier:
 *   patch:
 *     summary: Assigner/retirer le fournisseur d'un produit (Admin) — n'affecte rien d'autre
 *     tags: [Produits]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             supplierId: "clxxxxxx"
 *     responses:
 *       200:
 *         description: Produit mis à jour (id, name, supplierId)
 */
router.patch('/:id/supplier', authenticate, requireAdmin, productsController.assignSupplier);

/**
 * @swagger
 * /api/products/{id}:
 *   delete:
 *     summary: Supprimer un produit (Admin)
 *     tags: [Produits]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204:
 *         description: Supprimé
 */
router.delete('/:id', authenticate, requireAdmin, productsController.deleteProduct);

module.exports = router;