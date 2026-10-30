const express = require('express');
const { authenticate } = require('../../middlewares/auth.middleware');
const requireAdmin = require('../../middlewares/admin.middleware');
const { loadStoreContext } = require('../../middlewares/store.middleware');
const {
  listTransfers,
  createTransfer,
  validateTransfer,
  cancelTransfer,
} = require('./stock-transfers.controller');

const router = express.Router();

router.use(authenticate, requireAdmin, loadStoreContext);

router.get('/',                   listTransfers);
router.post('/',                  createTransfer);
router.patch('/:id/validate',     validateTransfer);
router.patch('/:id/cancel',       cancelTransfer);

module.exports = router;