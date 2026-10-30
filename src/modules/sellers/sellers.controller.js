const sellersService = require('./sellers.service');

async function getDashboardStats(req, res, next) {
  try {
    const stats = await sellersService.getSellerStats(req.user.id);
    res.json(stats);
  } catch (err) {
    next(err);
  }
}

async function getMyProducts(req, res, next) {
  try {
    const result = await sellersService.getSellerProducts(req.user.id, req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getMyOrders(req, res, next) {
  try {
    const result = await sellersService.getSellerOrders(req.user.id, req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getMyStock(req, res, next) {
  try {
    const stock = await sellersService.getSellerStock(req.user.id);
    res.json(stock);
  } catch (err) {
    next(err);
  }
}

// ─── Fonctions Admin pour la gestion des vendeurs ──────────────────────

async function getAllSellers(req, res, next) {
  try {
    const result = await sellersService.getAllSellers(req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function createSeller(req, res, next) {
  try {
    const seller = await sellersService.createSeller(req.body);
    res.status(201).json(seller);
  } catch (err) {
    next(err);
  }
}

async function updateSeller(req, res, next) {
  try {
    const { id } = req.params;
    const seller = await sellersService.updateSeller(id, req.body);
    res.json(seller);
  } catch (err) {
    next(err);
  }
}

async function toggleSellerActive(req, res, next) {
  try {
    const { id } = req.params;
    const seller = await sellersService.toggleSellerActive(id);
    res.json(seller);
  } catch (err) {
    next(err);
  }
}

async function getSellerProductsAdmin(req, res, next) {
  try {
    const { id } = req.params;
    const result = await sellersService.getSellerProductsAdmin(id, req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getSellerStatsAdmin(req, res, next) {
  try {
    const { id } = req.params;
    const stats = await sellersService.getSellerStatsAdmin(id);
    res.json(stats);
  } catch (err) {
    next(err);
  }
}

// ─── Gestion produits par le vendeur ─────────────────────────────────────

async function createProduct(req, res, next) {
  try {
    const product = await sellersService.createSellerProduct(req.user.id, req.body);
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
}

async function updateProduct(req, res, next) {
  try {
    const { id } = req.params;
    const product = await sellersService.updateSellerProduct(req.user.id, id, req.body);
    res.json(product);
  } catch (err) {
    next(err);
  }
}

async function deleteProduct(req, res, next) {
  try {
    const { id } = req.params;
    const result = await sellersService.deleteSellerProduct(req.user.id, id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// ─── Paramètres boutique du vendeur ─────────────────────────────────────

async function getStoreSettings(req, res, next) {
  try {
    const settings = await sellersService.getSellerStoreSettings(req.user.id);
    res.json(settings);
  } catch (err) {
    next(err);
  }
}

async function updateStoreSettings(req, res, next) {
  try {
    const settings = await sellersService.updateSellerStoreSettings(req.user.id, req.body);
    res.json(settings);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDashboardStats,
  getMyProducts,
  getMyOrders,
  getMyStock,
  getAllSellers,
  createSeller,
  updateSeller,
  toggleSellerActive,
  getSellerProductsAdmin,
  getSellerStatsAdmin,
  getStoreSettings,
  updateStoreSettings,
  createProduct,
  updateProduct,
  deleteProduct
};
