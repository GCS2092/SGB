const { getAccessibleStoreIds } = require('../modules/stores/store.service');

async function loadStoreContext(req, res, next) {
  try {
    if (!req.user) {
      req.storeIds = [];
      return next();
    }
    req.storeIds = await getAccessibleStoreIds(req.user);
    next();
  } catch (err) {
    next(err);
  }
}

function requireStoreAccess(req, res, next) {
  const storeId = req.params.storeId || req.body?.storeId || req.query?.storeId;
  if (!storeId) return next();
  if (req.user?.role === 'ADMIN') return next();
  if (!req.storeIds?.includes(storeId)) {
    return res.status(403).json({ message: 'Accès refusé à cette boutique.' });
  }
  next();
}

module.exports = { loadStoreContext, requireStoreAccess };
