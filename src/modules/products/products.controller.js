const productsService = require('./products.service');
const importService = require('./products.import.service');
const exportService = require('./products.export.service');

async function getProducts(req, res, next) {
  try {
    const result = await productsService.getProducts(req.query);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function getProductFilters(req, res, next) {
  try {
    const filters = await productsService.getProductFilters(req.query);
    res.json(filters);
  } catch (error) {
    next(error);
  }
}

async function getAllProductsAdmin(req, res, next) {
  try {
    const result = await productsService.getAllProductsAdmin(req.query, req.storeIds);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function getProductBySlug(req, res, next) {
  try {
    const product = await productsService.getProductBySlug(req.params.slug, req.query);
    if (!product) return res.status(404).json({ message: 'Produit introuvable' });
    res.json(product);
  } catch (error) {
    next(error);
  }
}

// ⚠️ Route strictement Admin (voir products.routes.js : requireAdmin).
// Les vendeurs créent/modifient/suppriment leurs produits via /api/sellers/products
// (sellers.controller.js), où l'isolation sellerId est déjà vérifiée.
async function createProduct(req, res, next) {
  try {
    const product = await productsService.createProduct(req.body);
    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
}

async function updateProduct(req, res, next) {
  try {
    const product = await productsService.updateProduct(req.params.id, req.body);
    res.json(product);
  } catch (error) {
    next(error);
  }
}

async function deleteProduct(req, res, next) {
  try {
    await productsService.deleteProduct(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

// ─── Import / Export Excel ──────────────────────────────────────────

async function importProducts(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: 'Aucun fichier reçu' });
    const report = await importService.importFromBuffer(req.file.buffer);
    res.status(200).json(report);
  } catch (error) {
    next(error);
  }
}

async function downloadTemplate(req, res, next) {
  try {
    const buffer = await exportService.generateTemplate();
    res.setHeader('Content-Disposition', 'attachment; filename=template-produits.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
}

async function exportProducts(req, res, next) {
  try {
    const buffer = await exportService.exportProducts();
    res.setHeader('Content-Disposition', 'attachment; filename=catalogue-produits.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
}

async function assignSupplier(req, res, next) {
  try {
    const { supplierId } = req.body;
    const product = await productsService.assignProductSupplier(req.params.id, supplierId || null);
    res.json(product);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getProducts,
  getProductFilters,
  getAllProductsAdmin,
  getProductBySlug,
  createProduct,
  updateProduct,
  deleteProduct,
  importProducts,
  downloadTemplate,
  exportProducts,
  assignSupplier,
};