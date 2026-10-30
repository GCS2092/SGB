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

async function createProduct(data) {
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

async function updateProduct(id, data) {
  const { images = [], variants = [], variantDisplayMode, storeId, sellerId, status, ...productData } = data;

  const existing = await prisma.product.findUnique({
    where: { id },
    include: { variants: true },
  });

  const existingVariantIds = existing?.variants.map((v) => v.id) || [];
  const incomingIds = variants.filter((v) => v.id).map((v) => v.id);
  const toDelete = existingVariantIds.filter((vid) => !incomingIds.includes(vid));

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

    await tx.productImage.deleteMany({ where: { productId: id } });
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
module.exports = {
  getProducts,
  getAllProductsAdmin,
  getProductBySlug,
  getProductFilters,
  createProduct,
  updateProduct,
  deleteProduct,
  assignProductSupplier, // ← ajouté
};