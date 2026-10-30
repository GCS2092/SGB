const categoriesService = require('./categories.service');

async function getCategories(req, res, next) {
  try {
    const categories = await categoriesService.getCategories(req.query);
    res.json(categories);
  } catch (error) {
    next(error);
  }
}

async function createCategory(req, res, next) {
  try {
    const category = await categoriesService.createCategory(req.body);
    res.status(201).json(category);
  } catch (error) {
    next(error);
  }
}

async function updateCategory(req, res, next) {
  try {
    const category = await categoriesService.updateCategory(req.params.id, req.body);
    res.json(category);
  } catch (error) {
    next(error);
  }
}

async function deleteCategory(req, res, next) {
  try {
    await categoriesService.deleteCategory(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

const categoriesController = {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};

module.exports = categoriesController;
