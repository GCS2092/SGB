const express = require('express');
const { body, param } = require('express-validator');
const cartController = require('./cart.controller');
const { checkValidation } = require('../../middlewares/validation.middleware');
const { apiLimiter } = require('../../middlewares/rateLimit.middleware');

const router = express.Router();

router.get('/', apiLimiter, cartController.getCart);

router.post(
  '/items',
  apiLimiter,
  body('productId').notEmpty().withMessage('productId requis'),
  body('quantity').optional().isInt({ min: 1 }).withMessage('Quantité invalide'),
  checkValidation,
  cartController.addItem
);

router.put(
  '/items/:itemId',
  apiLimiter,
  param('itemId').notEmpty(),
  body('quantity').isInt({ min: 1 }).withMessage('Quantité invalide'),
  checkValidation,
  cartController.updateItem
);

router.delete('/items/:itemId', apiLimiter, cartController.removeItem);

router.delete('/', apiLimiter, cartController.clearCart);

module.exports = router;