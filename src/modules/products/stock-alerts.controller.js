const stockAlertsService = require('./stock-alerts.service');

async function createStockAlert(req, res, next) {
  try {
    const userId = req.user?.id || null;
    const { productId, variantId, email } = req.body;
    const alert = await stockAlertsService.createStockAlert(userId, { productId, variantId, email });
    res.status(201).json(alert);
  } catch (error) { next(error); }
}

module.exports = { createStockAlert };