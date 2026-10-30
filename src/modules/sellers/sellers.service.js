const bcrypt = require('bcryptjs');
const prisma = require('../../config/database');
const { parsePagination, buildPaginationResponse } = require('../../utils/pagination.utils');

// ─── Tous les produits du vendeur ─────────────────────────────────────
async function getSellerProducts(userId, query = {}) {
  const { page, limit, skip } = parsePagination(query);

  const where = {
    sellerId: userId,
    ...(query.status && { status: query.status }), // ← Filtre par statut
    ...(query.search && {
      OR: [
        { name: { contains: query.search } },
        { description: { contains: query.search } }
      ]
    })
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
        _count: { select: { orderItems: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
  ]);

  return buildPaginationResponse({ data: products, total, page, limit });
}

// ─── Statistiques complètes sur les produits du vendeur ───────────────
async function getSellerStats(userId) {
  // Récupérer tous les produits du vendeur
  const products = await prisma.product.findMany({
    where: { sellerId: userId },
    select: { 
      id: true, 
      name: true,
      price: true, 
      stock: true, 
      isActive: true,
      lowStockAlert: true
    }
  });
  
  const productIds = products.map(p => p.id);
  
  // Récupérer tous les orderItems de ces produits
  const orderItems = await prisma.orderItem.findMany({
    where: { productId: { in: productIds } },
    include: {
      order: {
        select: { 
          status: true, 
          total: true, 
          createdAt: true 
        }
      }
    }
  });
  
  // Calculs
  const totalProducts = products.length;
  const activeProducts = products.filter(p => p.isActive).length;
  const lowStockProducts = products.filter(p => p.stock <= p.lowStockAlert).length;
  const outOfStockProducts = products.filter(p => p.stock === 0).length;
  
  const totalOrders = orderItems.length;
  const deliveredOrders = orderItems.filter(oi => oi.order.status === 'DELIVERED').length;
  const pendingOrders = orderItems.filter(oi => 
    ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED'].includes(oi.order.status)
  ).length;
  
  const totalRevenue = orderItems
    .filter(oi => oi.order.status === 'DELIVERED')
    .reduce((sum, oi) => sum + oi.subtotal, 0);
  
  const pendingRevenue = orderItems
    .filter(oi => ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED'].includes(oi.order.status))
    .reduce((sum, oi) => sum + oi.subtotal, 0);
  
  // Ventes par produit
  const salesByProduct = await Promise.all(
    products.map(async (product) => {
      const productOrderItems = orderItems.filter(oi => oi.productId === product.id);
      const productRevenue = productOrderItems
        .filter(oi => oi.order.status === 'DELIVERED')
        .reduce((sum, oi) => sum + oi.subtotal, 0);
      const productSales = productOrderItems
        .filter(oi => oi.order.status === 'DELIVERED')
        .reduce((sum, oi) => sum + oi.quantity, 0);
      
      return {
        productId: product.id,
        productName: product.name,
        revenue: productRevenue,
        sales: productSales,
        stock: product.stock,
        price: product.price
      };
    })
  );
  
  // Trier par CA décroissant
  salesByProduct.sort((a, b) => b.revenue - a.revenue);
  
  return {
    overview: {
      totalProducts,
      activeProducts,
      lowStockProducts,
      outOfStockProducts
    },
    orders: {
      total: totalOrders,
      delivered: deliveredOrders,
      pending: pendingOrders
    },
    revenue: {
      total: totalRevenue,
      pending: pendingRevenue
    },
    topProducts: salesByProduct.slice(0, 5),
    allProductsSales: salesByProduct
  };
}

// ─── Commandes contenant les produits du vendeur ─────────────────────
async function getSellerOrders(userId, query = {}) {
  const sellerProducts = await prisma.product.findMany({
    where: { sellerId: userId },
    select: { id: true }
  });

  const productIds = sellerProducts.map(p => p.id);

  const orderItems = await prisma.orderItem.findMany({
    where: { productId: { in: productIds } },
    select: { orderId: true }
  });

  const orderIds = [...new Set(orderItems.map(oi => oi.orderId))];

  const { page, limit, skip } = parsePagination(query);

  const where = {
    id: { in: orderIds },
    ...(query.status && { status: query.status })
  };

  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      skip,
      take: limit,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        shippingAddress: true,
        destination: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { firstName: true, lastName: true, email: true, phone: true } },
        items: {
          where: { productId: { in: productIds } },
          include: { product: { select: { name: true, sellerId: true } } }
        },
        tracking: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' }
    })
  ]);

  // ✅ Recalcule un sous-total propre au vendeur, au lieu d'exposer order.total
  // (qui inclut potentiellement les articles d'autres vendeurs dans la même commande)
  const sanitizedOrders = orders.map((order) => {
    const sellerSubtotal = order.items.reduce((sum, item) => sum + item.subtotal, 0);
    const sellerItemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
    return {
      ...order,
      sellerSubtotal,
      sellerItemCount,
    };
  });

  return buildPaginationResponse({ data: sanitizedOrders, total, page, limit });
}

// ─── État du stock par produit ─────────────────────────────────────────
async function getSellerStock(userId) {
  const products = await prisma.product.findMany({
    where: { sellerId: userId },
    include: {
      variants: true,
      images: { where: { isMain: true }, take: 1 }
    }
  });
  
  return products.map(product => ({
    id: product.id,
    name: product.name,
    stock: product.stock,
    lowStockAlert: product.lowStockAlert,
    status: product.stock === 0 ? 'OUT_OF_STOCK'
           : product.stock <= product.lowStockAlert ? 'LOW_STOCK'
           : 'OK',
    variants: product.variants.map(v => ({
      size: v.size,
      color: v.color,
      stock: v.stock
    })),
    mainImage: product.images[0]?.url || null
  }));
}

// ─── Fonctions Admin pour la gestion des vendeurs ──────────────────────

async function getAllSellers(query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const search = query.search || '';

  const where = search
    ? {
        role: 'SELLER',
        OR: [
          { email: { contains: search } },
          { firstName: { contains: search } },
          { lastName: { contains: search } },
        ],
      }
    : { role: 'SELLER' };

  const [total, sellers] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        isActive: true,
        createdAt: true,
        _count: {
          select: {
            sellerProducts: true,
            orders: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
  ]);

  return buildPaginationResponse({ data: sellers, total, page, limit });
}

async function createSeller(data) {
  const { email, password, firstName, lastName, phone } = data;

  if (!email?.trim() || !password || !firstName?.trim() || !lastName?.trim()) {
    const error = new Error('Email, mot de passe, prénom et nom sont requis.');
    error.status = 400;
    throw error;
  }

  if (password.length < 6) {
    const error = new Error('Le mot de passe doit contenir au moins 6 caractères.');
    error.status = 400;
    throw error;
  }

  const existingUser = await prisma.user.findUnique({ where: { email: email.trim() } });
  if (existingUser) {
    const error = new Error('Cet email est déjà utilisé.');
    error.status = 400;
    throw error;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const seller = await prisma.user.create({
    data: {
      email: email.trim(),
      password: hashedPassword,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone || null,
      role: 'SELLER',
      isActive: true
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      isActive: true,
      createdAt: true
    }
  });

  return seller;
}

async function updateSeller(id, data) {
  const { email, firstName, lastName, phone, isActive } = data;

  const updateData = {};
  if (email !== undefined) {
    const existingUser = await prisma.user.findUnique({ where: { email: email.trim() } });
    if (existingUser && existingUser.id !== id) {
      const error = new Error('Cet email est déjà utilisé.');
      error.status = 400;
      throw error;
    }
    updateData.email = email.trim();
  }
  if (firstName !== undefined) updateData.firstName = firstName.trim();
  if (lastName !== undefined) updateData.lastName = lastName.trim();
  if (phone !== undefined) updateData.phone = phone || null;
  if (isActive !== undefined) updateData.isActive = isActive;

  const seller = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      isActive: true,
      createdAt: true
    }
  });

  return seller;
}

async function toggleSellerActive(id) {
  const seller = await prisma.user.findUnique({ where: { id, role: 'SELLER' } });
  if (!seller) {
    const error = new Error('Vendeur introuvable.');
    error.status = 404;
    throw error;
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { isActive: !seller.isActive },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      isActive: true
    }
  });

  return updated;
}

async function getSellerProductsAdmin(sellerId, query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const search = query.search || '';

  const where = {
    sellerId,
    ...(search && {
      OR: [
        { name: { contains: search } },
        { description: { contains: search } }
      ]
    })
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
        _count: { select: { orderItems: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
  ]);

  return buildPaginationResponse({ data: products, total, page, limit });
}

async function getSellerStatsAdmin(sellerId) {
  return getSellerStats(sellerId);
}

// ─── Gestion produits par le vendeur ─────────────────────────────────────

async function createSellerProduct(userId, productData) {
  const {
    name,
    slug,
    description,
    price,
    stock,
    categoryId,
    purchasePrice,
    lowStockAlert,
    isActive,
    status,
    images,
  } = productData;

  if (!name?.trim() || !slug?.trim() || !price || !stock || !categoryId) {
    const error = new Error('Nom, slug, prix, stock et catégorie sont requis.');
    error.status = 400;
    throw error;
  }

  const product = await prisma.product.create({
    data: {
      name: name.trim(),
      slug: slug.trim(),
      description: description?.trim() || '',
      price: parseInt(price),
      stock: parseInt(stock),
      categoryId,
      purchasePrice: purchasePrice ? parseInt(purchasePrice) : null,
      lowStockAlert: lowStockAlert ? parseInt(lowStockAlert) : 5,
      isActive: isActive !== undefined ? isActive : true,
      status: status || 'DRAFT',
      sellerId: userId,
      ...(Array.isArray(images) && images.length > 0 && {
        images: {
          create: images.map((img, index) => ({
            url: img.url,
            publicId: img.publicId,
            isMain: img.isMain ?? index === 0,
            position: img.position ?? index,
          })),
        },
      }),
    },
    include: {
      category: true,
      images: true,
      variants: true,
    },
  });

  return product;
}

async function updateSellerProduct(userId, productId, productData) {
  const existingProduct = await prisma.product.findUnique({
    where: { id: productId },
    select: { sellerId: true },
  });

  if (!existingProduct) {
    const error = new Error('Produit introuvable.');
    error.status = 404;
    throw error;
  }

  if (existingProduct.sellerId !== userId) {
    const error = new Error('Accès refusé à ce produit.');
    error.status = 403;
    throw error;
  }

  const {
    name,
    slug,
    description,
    price,
    stock,
    categoryId,
    purchasePrice,
    lowStockAlert,
    isActive,
    status,
    images,
  } = productData;

  const updateData = {};
  if (name !== undefined) updateData.name = name.trim();
  if (slug !== undefined) updateData.slug = slug.trim();
  if (description !== undefined) updateData.description = description.trim();
  if (price !== undefined) updateData.price = parseInt(price);
  if (stock !== undefined) updateData.stock = parseInt(stock);
  if (categoryId !== undefined) updateData.categoryId = categoryId;
  if (purchasePrice !== undefined) updateData.purchasePrice = purchasePrice ? parseInt(purchasePrice) : null;
  if (lowStockAlert !== undefined) updateData.lowStockAlert = parseInt(lowStockAlert);
  if (isActive !== undefined) updateData.isActive = isActive;
  if (status !== undefined) updateData.status = status;

  const product = await prisma.$transaction(async (tx) => {
    if (Array.isArray(images)) {
      await tx.productImage.deleteMany({ where: { productId } });
      if (images.length > 0) {
        await tx.productImage.createMany({
          data: images.map((img, index) => ({
            productId,
            url: img.url,
            publicId: img.publicId,
            isMain: img.isMain ?? index === 0,
            position: img.position ?? index,
          })),
        });
      }
    }

    return tx.product.update({
      where: { id: productId },
      data: updateData,
      include: {
        category: true,
        images: true,
        variants: true,
      },
    });
  });

  return product;
}



async function deleteSellerProduct(userId, productId) {
  // Vérifier que le produit appartient au vendeur
  const existingProduct = await prisma.product.findUnique({
    where: { id: productId },
    select: { sellerId: true }
  });

  if (!existingProduct) {
    const error = new Error('Produit introuvable.');
    error.status = 404;
    throw error;
  }

  if (existingProduct.sellerId !== userId) {
    const error = new Error('Accès refusé à ce produit.');
    error.status = 403;
    throw error;
  }

  await prisma.product.delete({
    where: { id: productId }
  });

  return { message: 'Produit supprimé avec succès' };
}

// ─── Paramètres boutique du vendeur ─────────────────────────────────────

async function getSellerStoreSettings(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      storeName: true,
      storeDescription: true,
      storeLogo: true,
      storeContact: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true
    }
  });

  if (!user) {
    const error = new Error('Utilisateur introuvable.');
    error.status = 404;
    throw error;
  }

  return user;
}

async function updateSellerStoreSettings(userId, data) {
  const { storeName, storeDescription, storeLogo, storeContact } = data;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(storeName !== undefined && { storeName: storeName.trim() }),
      ...(storeDescription !== undefined && { storeDescription: storeDescription.trim() }),
      ...(storeLogo !== undefined && { storeLogo: storeLogo.trim() || null }),
      ...(storeContact !== undefined && { storeContact: storeContact.trim() || null }),
    },
    select: {
      id: true,
      storeName: true,
      storeDescription: true,
      storeLogo: true,
      storeContact: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true
    }
  });

  return updated;
}

module.exports = {
  getSellerProducts,
  getSellerStats,
  getSellerOrders,
  getSellerStock,
  getAllSellers,
  createSeller,
  updateSeller,
  toggleSellerActive,
  getSellerProductsAdmin,
  getSellerStatsAdmin,
  getSellerStoreSettings,
  updateSellerStoreSettings,
  createSellerProduct,
  updateSellerProduct,
  deleteSellerProduct
};
