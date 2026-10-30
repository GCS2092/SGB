const express = require('express');
const router = express.Router();
const settingsController = require('./settings.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const requireAdmin = require('../../middlewares/admin.middleware');

router.get('/', settingsController.getSettings);
router.put('/', authenticate, requireAdmin, settingsController.updateSettings);

module.exports = router;
