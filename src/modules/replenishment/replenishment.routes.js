const express = require('express');
const { isAdmin } = require('../../middlewares/auth.middleware');
const { assertStoreAccess } = require('../stores/store.service');
const svc = require('./replenishment.service');

const router = express.Router();
const need = (v) => { if (!v) { const e = new Error('storeId requis.'); e.status = 400; throw e; } return String(v); };

router.get('/', isAdmin, async (req, res, next) => {
  try {
    const storeId = need(req.query.storeId);
    await assertStoreAccess(req.user, storeId);
    const items = await svc.computeLowStock(storeId);
    res.json({ storeId, count: items.length, items });
  } catch (err) { next(err); }
});

router.post('/create-orders', isAdmin, async (req, res, next) => {
  try {
    const storeId = need(req.body.storeId);
    await assertStoreAccess(req.user, storeId);
    const orders = await svc.createOrdersFromLines({ storeId, lines: req.body.lines, userId: req.user.id, ip: req.ip });
    res.status(201).json({ orders });
  } catch (err) { next(err); }
});

router.post('/scan', isAdmin, async (req, res, next) => {
  try { res.json(await svc.scanLowStock()); } catch (err) { next(err); }
});

module.exports = router;