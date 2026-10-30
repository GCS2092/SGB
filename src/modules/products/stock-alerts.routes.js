const express = require('express');
const router = express.Router();
const { createAlert } = require('./stock-alerts.service');
const { authenticateOptional } = require('../../middlewares/auth.middleware');

/**
 * @swagger
 * /api/stock-alerts:
 *   post:
 *     summary: Créer une alerte de retour en stock
 *     tags: [StockAlerts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             productId: "clxxxxxx"
 *             variantId: "clyyyyyy"
 *             email: "client@example.com"
 *     responses:
 *       201:
 *         description: Alerte créée
 */
router.post('/', authenticateOptional, async (req, res, next) => {
  try {
    const { productId, variantId, email } = req.body;
    const alert = await createAlert({
      userId: req.user?.id,
      email: req.user?.email || email,
      productId,
      variantId,
    });
    res.status(201).json(alert);
  } catch (err) {
    next(err);
  }
});

module.exports = router;