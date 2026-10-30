/** Applique un filtre storeId sur un objet Prisma `where`. */
function applyStoreIdToWhere(where, storeId) {
  if (storeId) where.storeId = storeId;
  return where;
}

module.exports = { applyStoreIdToWhere };
