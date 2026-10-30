const express = require('express');
const { authenticate } = require('../../middlewares/auth.middleware');
const requireAdmin = require('../../middlewares/admin.middleware');
const { loadStoreContext } = require('../../middlewares/store.middleware');
const { createCreditNote, listCreditNotes } = require('./credit-notes.controller');

const router = express.Router();

router.use(authenticate, requireAdmin, loadStoreContext);
router.get('/', listCreditNotes);
router.post('/', createCreditNote);

module.exports = router;
