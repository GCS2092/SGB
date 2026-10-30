const express = require('express');
const router = express.Router();
const sellersController = require('./sellers.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireSeller } = require('../../middlewares/seller.middleware');
const requireAdmin = require('../../middlewares/admin.middleware');

// Routes vendeur (authentification + rôle vendeur requis)
router.use(authenticate, requireSeller);
router.get('/stats', sellersController.getDashboardStats);
router.get('/products', sellersController.getMyProducts);
router.post('/products', sellersController.createProduct);
router.put('/products/:id', sellersController.updateProduct);
router.delete('/products/:id', sellersController.deleteProduct);
router.get('/orders', sellersController.getMyOrders);
router.get('/stock', sellersController.getMyStock);
router.get('/store-settings', sellersController.getStoreSettings);
router.put('/store-settings', sellersController.updateStoreSettings);

// Routes admin pour gérer les vendeurs
const adminRouter = express.Router();
adminRouter.use(authenticate, requireAdmin);
adminRouter.get('/all', sellersController.getAllSellers);
adminRouter.post('/', sellersController.createSeller);
adminRouter.put('/:id', sellersController.updateSeller);
adminRouter.patch('/:id/toggle', sellersController.toggleSellerActive);
adminRouter.get('/:id/products', sellersController.getSellerProductsAdmin);
adminRouter.get('/:id/stats', sellersController.getSellerStatsAdmin);

module.exports = { router, adminRouter };
