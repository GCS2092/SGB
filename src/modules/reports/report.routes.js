const express = require('express');
const router = express.Router();
const { downloadReport, sendReportByEmail } = require('./report.controller');
const { authenticate, requireAdmin } = require('../../middlewares/auth.middleware');

// Télécharger le PDF directement
router.get('/download', authenticate, requireAdmin, downloadReport);

// Envoyer par email
router.post('/send-email', authenticate, requireAdmin, sendReportByEmail);

module.exports = router;