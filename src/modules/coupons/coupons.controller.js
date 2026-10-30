const couponsService = require('./coupons.service');

async function validateCoupon(req, res, next) {
  try {
    const result = await couponsService.validateCoupon(
      req.body.code,
      req.body.orderAmount,
      req.body.storeId || req.query.storeId,
    );
    res.json(result);
  } catch (error) { next(error); }
}

async function getCoupons(req, res, next) {
  try {
    const coupons = await couponsService.getCoupons(req.query);
    res.json(coupons);
  } catch (error) { next(error); }
}

async function createCoupon(req, res, next) {
  try {
    const coupon = await couponsService.createCoupon(req.body);
    res.status(201).json(coupon);
  } catch (error) { next(error); }
}

async function updateCoupon(req, res, next) {
  try {
    const coupon = await couponsService.updateCoupon(req.params.id, req.body);
    res.json(coupon);
  } catch (error) { next(error); }
}

async function deleteCoupon(req, res, next) {
  try {
    await couponsService.deleteCoupon(req.params.id);
    res.status(204).end();
  } catch (error) { next(error); }
}

async function getPublicCoupons(req, res, next) {
  try {
    const coupons = await couponsService.getPublicCoupons(req.query.storeId);
    res.json(coupons);
  } catch (error) { next(error); }
}

module.exports = { validateCoupon, getCoupons, createCoupon, updateCoupon, deleteCoupon, getPublicCoupons };
