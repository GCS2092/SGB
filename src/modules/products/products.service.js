const prisma = require('../../config/database');
const { parsePagination, buildPaginationResponse } = require('../../utils/pagination.utils');
const {
  buildProductStoreFilter,
  buildAdminCatalogWhere,
  isProductVisibleForStore,
  resolveStoreIdForCatalog,
} = require('../stores/store.service');
const { notifyStockAlerts } = require('./stock-alerts.service');

async function getProducts(query) {
  const { page, limit, skip } = parsePagination(query);

  const storeId = await resolveStoreIdForCatalog(query.storeId);
  const storeFilter = buildProductStoreFilter(storeId);

  const minPrice = query.minPrice !== undefined && query.minPrice !== '' ? Number(query.minPrice) : undefined;
  const maxPrice = query.maxPrice !== undefined && query.maxPrice !== '' ? Number(query.maxPrice) : undefined;
  const sizes = query.size ? String(query.size).split(',').filter(Boolean) : [];
  const colors = query.color ? String(query.color).split(',').filter(Boolean) : [];
  const inStock = query.inStock === 'true' || query.inStock === true;

  const where = {
    isActive: true,
    status: 'PUBLISHED', // ← Nouveau : seuls les produits publiés sont visibles
    ...storeFilter,
    ...(query.featured === 'true' || query.featured === true ? { isFeatured: true } : {}),
    ...(query.category && { category: { slug: query.category } }),
    ...(query.search && {
      OR: [
        { name: { contains: query.search } },
        { description: { contains: query.search } },
      ],
    }),
    ...((minPrice !== undefined || maxPrice !== undefined) && {
      price: {
        ...(minPrice !== undefined && !isNaN(minPrice) && { gte: minPrice }),
        ...(maxPrice !== undefined && !isNaN(maxPrice) && { lte: maxPrice }),
      },
    }),
    ...(inStock && { stock: { gt: 0 } }),
    ...((sizes.length > 0 || colors.length > 0) && {
      variants: {
        some: {
          ...(sizes.length > 0 && { size: { in: sizes } }),
          ...(colors.length > 0 && { color: { in: colors } }),
        },
      },
    }),
  };

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      include: { images: true, variants: true, category: true },
      orderBy: buildProductOrderBy(query.sort),
    }),
  ]);

  return buildPaginationResponse({ data: products, total, page, limit });
}

function buildProductOrderBy(sort) {
  switch (sort) {
    case 'price_asc': return { price: 'asc' };
    case 'price_desc': return { price: 'desc' };
    case 'name_asc': return { name: 'asc' };
    default: return { createdAt: 'desc' };
  }
}

async function getProductFilters(query) {
  const storeId = await resolveStoreIdForCatalog(query.storeId);
  const storeFilter = buildProductStoreFilter(storeId);

  const where = {
    isActive: true,
    status: 'PUBLISHED', // ← Nouveau : seuls les produits publiés sont visibles
    ...storeFilter,
    ...(query.category && { category: { slug: query.category } }),
    ...(query.search && {
      OR: [
        { name: { contains: query.search } },
        { description: { contains: query.search } },
      ],
    }),
  };

  const [priceAgg, variants] = await Promise.all([
    prisma.product.aggregate({ where, _min: { price: true }, _max: { price: true } }),
    prisma.productVariant.findMany({
      where: { product: where },
      select: { size: true, color: true },
    }),
  ]);

  const sizes = [...new Set(variants.map((v) => v.size).filter(Boolean))].sort();
  const colors = [...new Set(variants.map((v) => v.color).filter(Boolean))].sort();

  return {
    priceMin: priceAgg._min.price ?? 0,
    priceMax: priceAgg._max.price ?? 0,
    sizes,
    colors,
  };
}

// ─── Admin : tous les produits ─────────────────────────────────────────────
async function getAllProductsAdmin(query, accessibleStoreIds = null) {
  const { page, limit, skip } = parsePagination(query);

  const where = {
    ...buildAdminCatalogWhere(query.storeId, accessibleStoreIds),
    ...(query.status && { status: query.status }), // ← Filtre par statut
    ...(query.search && {
      OR: [
        { name: { contains: query.search } },
        { description: { contains: query.search } },
      ],
    }),
  };

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      include: {
        images: true,
        variants: true,
        category: true,
        store: { select: { id: true, name: true, code: true } },
        supplier: { select: { id: true, name: true, phone: true } },
        seller: { select: { id: true, firstName: true, lastName: true, email: true } }, // ← ajouté
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  return buildPaginationResponse({ data: products, total, page, limit });
}

async function getProductBySlug(slug, query = {}) {
  const product = await prisma.product.findUnique({
    where: { slug },
    include: { images: true, variants: true, category: true },
  });

  if (!product || !product.isActive || product.status !== 'PUBLISHED') return null;

  const storeId = await resolveStoreIdForCatalog(query.storeId);
  if (!isProductVisibleForStore(product.storeId, storeId)) return null;

  return product;
}

/* LOT1 */
function cleanProductData(raw = {}) {
  const d = { ...raw };
  for (const k of ['sku', 'barcode']) {
    if (d[k] !== undefined) {
      const v = d[k] == null ? '' : String(d[k]).trim();
      d[k] = v === '' ? null : v;
    }
  }
  if (d.supplierId === '') d.supplierId = null;
  if (d.lowStockAlert === '' || d.lowStockAlert === null) d.lowStockAlert = 5;
  else if (d.lowStockAlert !== undefined) d.lowStockAlert = Math.round(Number(d.lowStockAlert));
  if (d.overstockAlert === '') d.overstockAlert = null;
  else if (d.overstockAlert != null) d.overstockAlert = Math.round(Number(d.overstockAlert));
  return d;
}

async function createProduct(rawData) {
  const data = cleanProductData(rawData);
  const { images = [], variants = [], variantDisplayMode, storeId, sellerId, status, ...productData } = data;

  // Déterminer le statut initial
  let initialStatus = status || 'DRAFT';
  const stock = Number(productData.stock) || 0;

  // Si stock = 0 et pas de statut explicite, mettre en OUT_OF_STOCK
  if (stock === 0 && !status) {
    initialStatus = 'OUT_OF_STOCK';
  }

  return prisma.product.create({
    data: {
      ...productData,
      storeId: storeId || null,
      sellerId: sellerId || null,
      status: initialStatus,
      variantDisplayMode: variantDisplayMode || 'SIZE_FIRST',
      ...(images.length > 0 && {
        images: {
          create: images.map((img) => ({
            url: img.url,
            publicId: img.publicId || '',
            isMain: img.isMain ?? false,
            position: img.position ?? 0,
            color: img.color || null,
          })),
        },
      }),
      ...(variants.length > 0 && {
        variants: {
          create: variants.map((v) => ({
            size: v.size || '',
            color: v.color || '',
            stock: Number(v.stock) || 0,
          })),
        },
      }),
    },
    include: { images: true, variants: true },
  });
}

async function updateProduct(id, rawData) {
  const data = cleanProductData(rawData);
  const { images = [], variants = [], variantDisplayMode, storeId, sellerId, status, ...productData } = data;

  const existing = await prisma.product.findUnique({
    where: { id },
    include: { variants: true },
  });

  const existingVariantIds = existing?.variants.map((v) => v.id) || [];
  const incomingIds = variants.filter((v) => v.id).map((v) => v.id);
  const toDelete = data.variants === undefined ? [] : existingVariantIds.filter((vid) => !incomingIds.includes(vid));

  const restockedVariantIds = [];
  let productRestocked = false;

  if (
    productData.stock !== undefined &&
    Number(existing?.stock) === 0 &&
    Number(productData.stock) > 0
  ) {
    productRestocked = true;
  }

  for (const v of variants) {
    if (v.id) {
      const before = existing?.variants.find((ev) => ev.id === v.id);
      if (before && Number(before.stock) === 0 && Number(v.stock) > 0) {
        restockedVariantIds.push(v.id);
      }
    }
  }

  // Logique automatique du statut basée sur le stock
  let finalStatus = status;
  const newStock = productData.stock !== undefined ? Number(productData.stock) : Number(existing?.stock);

  if (status === undefined) {
    // Si pas de statut explicite, appliquer la logique automatique
    if (newStock === 0 && existing?.status === 'PUBLISHED') {
      finalStatus = 'OUT_OF_STOCK';
    } else if (newStock > 0 && existing?.status === 'OUT_OF_STOCK') {
      finalStatus = 'PUBLISHED';
    } else {
      finalStatus = existing?.status || 'DRAFT';
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (toDelete.length > 0) {
      await tx.productVariant.deleteMany({ where: { id: { in: toDelete } } });
    }

    for (const v of variants) {
      if (v.id) {
        await tx.productVariant.update({
          where: { id: v.id },
          data: { size: v.size || '', color: v.color || '', stock: Number(v.stock) || 0 },
        });
      } else {
        await tx.productVariant.create({
          data: { productId: id, size: v.size || '', color: v.color || '', stock: Number(v.stock) || 0 },
        });
      }
    }

    if (data.images !== undefined) await tx.productImage.deleteMany({ where: { productId: id } });
    if (images.length > 0) {
      await tx.productImage.createMany({
        data: images.map((img) => ({
          productId: id,
          url: img.url,
          publicId: img.publicId || '',
          isMain: img.isMain ?? false,
          position: img.position ?? 0,
          color: img.color || null,
        })),
      });
    }

    return tx.product.update({
      where: { id },
      data: {
        ...productData,
        ...(storeId !== undefined && { storeId: storeId || null }),
        ...(sellerId !== undefined && { sellerId: sellerId || null }),
        ...(variantDisplayMode && { variantDisplayMode }),
        ...(finalStatus && { status: finalStatus }),
      },
      include: { images: true, variants: true },
    });
  });

  if (productRestocked) {
    notifyStockAlerts({ productId: id, variantId: null }).catch((err) =>
      console.error('❌ Erreur notifyStockAlerts (produit):', err.message)
    );
  }
  for (const variantId of restockedVariantIds) {
    notifyStockAlerts({ productId: id, variantId }).catch((err) =>
      console.error('❌ Erreur notifyStockAlerts (variante):', err.message)
    );
  }

  return updated;
}

async function deleteProduct(id) {
  return prisma.product.delete({ where: { id } });
}
// ─── Assignation rapide du fournisseur — ne touche à rien d'autre ──────────
async function assignProductSupplier(id, supplierId) {
  return prisma.product.update({
    where: { id },
    data: { supplierId: supplierId || null },
    select: { id: true, name: true, supplierId: true },
  });
}
/* LOT1 variantes */
const httpErr = (m, s = 400) => { const e = new Error(m); e.status = s; return e; };
const cleanStr = (v) => (v == null ? '' : String(v).trim());
const orNull = (v) => { const s = cleanStr(v); return s === '' ? null : s; };
const variantErr = (e) => (e.code === 'P2002' ? httpErr('Cette variante (taille/couleur), ce SKU ou ce code-barres existe déjà.', 409) : e);

async function addVariant(productId, body = {}) {
  const size = cleanStr(body.size);
  const color = cleanStr(body.color);
  if (!size && !color) throw httpErr('Indiquez une taille ou une couleur.');
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) throw httpErr('Produit introuvable.', 404);
  try {
    // Stock a 0 : le stock se saisit par mouvement (rattache a une boutique)
    return await prisma.productVariant.create({
      data: { productId, size, color, stock: 0, sku: orNull(body.sku), barcode: orNull(body.barcode) },
    });
  } catch (e) { throw variantErr(e); }
}

async function updateVariant(variantId, body = {}) {
  const data = {};
  if (body.size !== undefined) data.size = cleanStr(body.size);
  if (body.color !== undefined) data.color = cleanStr(body.color);
  if (body.sku !== undefined) data.sku = orNull(body.sku);
  if (body.barcode !== undefined) data.barcode = orNull(body.barcode);
  try {
    return await prisma.productVariant.update({ where: { id: variantId }, data });
  } catch (e) {
    if (e.code === 'P2025') throw httpErr('Variante introuvable.', 404);
    throw variantErr(e);
  }
}

async function deleteVariant(variantId) {
  const v = await prisma.productVariant.findUnique({ where: { id: variantId } });
  if (!v) throw httpErr('Variante introuvable.', 404);
  if (v.stock !== 0 || v.reservedStock !== 0) throw httpErr('Stock non nul : mettez le stock à zéro avant de supprimer la variante.', 409);
  const where = { variantId };
  const counts = await Promise.all([
    prisma.orderItem.count({ where }),
    prisma.stockMovement.count({ where }),
    prisma.stockTransferItem.count({ where }),
    prisma.purchaseOrderItem.count({ where }),
    prisma.inventoryLine.count({ where }),
    prisma.stockAlert.count({ where }),
  ]);
  if (counts.some((c) => c > 0)) throw httpErr('Variante déjà utilisée (commandes, mouvements, transferts…) : elle ne peut plus être supprimée.', 409);
  await prisma.productVariant.delete({ where: { id: variantId } }); // StoreStock supprime en cascade
  return { success: true };
}

module.exports = {
  addVariant,
  updateVariant,
  deleteVariant,
  getProducts,
  getAllProductsAdmin,
  getProductBySlug,
  getProductFilters,
  createProduct,
  updateProduct,
  deleteProduct,
  assignProductSupplier, // ← ajouté
};