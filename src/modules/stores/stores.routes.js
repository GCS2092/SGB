const express = require('express');
const { authenticate } = require('../../middlewares/auth.middleware');
const requireAdmin = require('../../middlewares/admin.middleware');
const { loadStoreContext } = require('../../middlewares/store.middleware');
const {
  getStores,
  getMainStoreHandler,
  createStore,
  updateStore,
  assignUserToStore,
  getUserStores,
  removeUserFromStore,
} = require('./stores.controller');

const router = express.Router();

router.get('/main', getMainStoreHandler);

router.use(authenticate, loadStoreContext);
router.get('/', getStores);
router.post('/', requireAdmin, createStore);
router.patch('/:id', requireAdmin, updateStore);
router.post('/assign-user', requireAdmin, assignUserToStore);
router.post('/remove-user', requireAdmin, removeUserFromStore);
router.get('/user/:userId', requireAdmin, getUserStores);

module.exports = router;