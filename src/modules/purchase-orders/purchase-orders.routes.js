const express = require('express');
const { authenticate } = require('../../middlewares/auth.middleware');
const requireAdmin = require('../../middlewares/admin.middleware');
const { loadStoreContext } = require('../../middlewares/store.middleware');
const { assertStoreAccess } = require('../stores/store.service');
const svc = require('./purchase-orders.service');

const router = express.Router();
router.use(authenticate, requireAdmin, loadStoreContext);

const wrap = (fn) => async (req, res, next) => {
  try { res.json(await fn(req)); } catch (e) { next(e); }
};
const load = async (req) => {
  const po = await svc.get(req.params.id);
  await assertStoreAccess(req.user, po.storeId);
  return po;
};

router.get('/', wrap((req) => svc.list(req.query, req.storeIds)));
router.post('/', async (req, res, next) => {
  try {
    if (!req.body.storeId) return res.status(400).json({ message: 'storeId requis.' });
    await assertStoreAccess(req.user, req.body.storeId);
    const po = await svc.create({ ...req.body, createdBy: req.user.id, ip: req.ip });
    res.status(201).json(po);
  } catch (e) { next(e); }
});
router.get('/:id', wrap(load));
router.patch('/:id/send', wrap(async (req) => { await load(req); return svc.send(req.params.id, req.user.id, req.ip); }));
router.post('/:id/receive', wrap(async (req) => { await load(req); return svc.receive(req.params.id, req.body.lines, req.user.id, req.ip); }));
router.patch('/:id/cancel', wrap(async (req) => { await load(req); return svc.cancel(req.params.id, req.user.id, req.ip); }));

module.exports = router;