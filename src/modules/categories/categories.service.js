const prisma = require('../../config/database');
const { buildProductStoreFilter, resolveStoreIdForCatalog } = require('../stores/store.service');

async function getCategories(query = {}) {
  const storeId = await resolveStoreIdForCatalog(query.storeId);

  if (!storeId) {
    return prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  return prisma.category.findMany({
    where: {
      isActive: true,
      products: {
        some: {
          isActive: true,
          ...buildProductStoreFilter(storeId),
        },
      },
    },
    orderBy: { name: 'asc' },
  });
}

async function createCategory(data) {
  return prisma.category.create({ data });
}

async function updateCategory(id, data) {
  return prisma.category.update({ where: { id }, data });
}

async function deleteCategory(id) {
  return prisma.category.delete({ where: { id } });
}

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};
