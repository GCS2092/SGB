const prisma = require('../../config/database');

const MAIN_STORE_ID = 'clmainstore000000000001';

async function getMainStore() {
  const main = await prisma.store.findFirst({ where: { isMain: true, isActive: true } });
  if (main) return main;
  return prisma.store.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
}

async function resolveStoreForOrder(storeId) {
  if (storeId) {
    const store = await prisma.store.findFirst({ where: { id: storeId, isActive: true } });
    if (!store) {
      const error = new Error('Boutique introuvable ou inactive.');
      error.status = 400;
      throw error;
    }
    return store;
  }
  const main = await getMainStore();
  if (!main) {
    const error = new Error('Aucune boutique active configurée.');
    error.status = 500;
    throw error;
  }
  return main;
}

async function getAccessibleStoreIds(user) {
  if (!user) return [];
  if (user.role === 'ADMIN') {
    const stores = await prisma.store.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    return stores.map((s) => s.id);
  }
  const links = await prisma.userStore.findMany({
    where: { userId: user.id, store: { isActive: true } },
    select: { storeId: true },
  });
  return links.map((l) => l.storeId);
}

async function assertStoreAccess(user, storeId) {
  if (!storeId) return;
  if (user?.role === 'ADMIN') return;
  const allowed = await getAccessibleStoreIds(user);
  if (!allowed.includes(storeId)) {
    const error = new Error('Accès refusé à cette boutique.');
    error.status = 403;
    throw error;
  }
}

function applyStoreScope(where, storeIds, storeIdFilter) {
  if (storeIdFilter) {
    if (storeIds.length && !storeIds.includes(storeIdFilter)) {
      const error = new Error('Accès refusé à cette boutique.');
      error.status = 403;
      throw error;
    }
    where.storeId = storeIdFilter;
    return where;
  }
  if (storeIds.length) {
    where.storeId = { in: storeIds };
  }
  return where;
}

/** Produits visibles sur une boutique : assignés à cette boutique ou globaux (storeId null). */
function buildProductStoreFilter(storeId) {
  if (!storeId) {
    return { storeId: null };
  }
  return {
    OR: [{ storeId }, { storeId: null }],
  };
}

/** Filtre admin catalogue : boutique choisie, ou boutiques accessibles + globaux. */
function buildAdminCatalogWhere(queryStoreId, accessibleStoreIds) {
  if (queryStoreId) return buildProductStoreFilter(queryStoreId);
  if (!Array.isArray(accessibleStoreIds)) return {};
  if (accessibleStoreIds.length === 0) return { id: '__no_store_access__' };
  return {
    OR: [
      { storeId: { in: accessibleStoreIds } },
      { storeId: null },
    ],
  };
}

/**
 * ✅ FIX DÉFINITIF : Un produit est visible si :
 * - son storeId est null (produit global)
 * - aucun storeId n'est résolu (contexte sans boutique)
 * - son storeId correspond exactement au storeId demandé
 */
function isProductVisibleForStore(productStoreId, storeId) {
  if (productStoreId == null) return true;  // produit global → toujours visible
  if (storeId == null) return true;          // pas de boutique résolue → tout visible
  return productStoreId === storeId;         // sinon, comparaison exacte
}

function isCouponValidForStore(couponStoreId, storeId) {
  if (couponStoreId == null) return true;
  return couponStoreId === storeId;
}

async function resolveStoreIdForCatalog(queryStoreId) {
  if (queryStoreId) return queryStoreId;
  const main = await getMainStore();
  return main?.id || null;
}

function computeStoreDiscount(subtotal, discountRate) {
  if (!discountRate) return 0;
  return Math.floor(subtotal * (discountRate / 100));
}

function computeTax(amount, taxRate) {
  if (!taxRate) return 0;
  return Math.floor(amount * (taxRate / 100));
}

async function listStores(user) {
  if (user?.role === 'ADMIN') {
    return prisma.store.findMany({ orderBy: [{ isMain: 'desc' }, { name: 'asc' }] });
  }
  const storeIds = await getAccessibleStoreIds(user);
  return prisma.store.findMany({
    where: { id: { in: storeIds } },
    orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
  });
}

module.exports = {
  MAIN_STORE_ID,
  getMainStore,
  resolveStoreForOrder,
  resolveStoreIdForCatalog,
  getAccessibleStoreIds,
  assertStoreAccess,
  applyStoreScope,
  buildProductStoreFilter,
  buildAdminCatalogWhere,
  isProductVisibleForStore,
  isCouponValidForStore,
  computeStoreDiscount,
  computeTax,
  listStores,
};