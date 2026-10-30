const express = require('express');
const router = express.Router();
const { initier, notifier, notifierHealthCheck, verifier } = require('./payments.controller');

router.post('/cinetpay/initier', initier);
router.get('/cinetpay/notify', notifierHealthCheck); // sonde de santé CinetPay
router.post('/cinetpay/notify', notifier);
router.get('/cinetpay/verifier/:orderId', verifier);

module.exports = router;