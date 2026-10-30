const express = require('express');
const { isAdmin } = require('../../middlewares/auth.middleware');
const { loadStoreContext } = require('../../middlewares/store.middleware');
const invoicesController = require('./invoices.controller');

const router = express.Router();

router.use(isAdmin, loadStoreContext);

router.get('/export/excel', invoicesController.exportInvoicesExcel);
router.get('/', invoicesController.listInvoices);
router.get('/order/:orderId', invoicesController.getInvoiceByOrder);
router.get('/:id/pdf', invoicesController.downloadInvoicePdf);
router.get('/:id', invoicesController.getInvoiceById);

module.exports = router;
