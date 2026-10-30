const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middlewares/auth.middleware');
const requireAdmin = require('../../middlewares/admin.middleware');
const { loadStoreContext } = require('../../middlewares/store.middleware');
const {
  getOrdersAdmin,
  updatePaymentStatus,
  confirmDraftOrder,
  rejectDraftOrder,
  createManualOrder,
  searchUsers,
  searchProducts,
} = require('./orders.admin.controller');

router.use(authenticate, requireAdmin, loadStoreContext);

// ⚠️ Les routes spécifiques AVANT /:id
router.get('/search/users', searchUsers);
router.get('/search/products', searchProducts);

router.get('/', getOrdersAdmin);
router.post('/', createManualOrder);
router.patch('/:id/payment', updatePaymentStatus);
router.patch('/:id/confirm-draft', confirmDraftOrder);
router.patch('/:id/reject-draft', rejectDraftOrder);

module.exports = router;