const prisma = require('../../config/database');

async function mergeGuestCart(userId, anonymousId) {
  const guestCart = await prisma.cart.findUnique({ where: { anonymousId }, include: { items: true } });
  if (!guestCart) {
    return null;
  }

  let userCart = await prisma.cart.findFirst({ where: { userId } });
  if (!userCart) {
    userCart = await prisma.cart.create({ data: { userId } });
  }

  await Promise.all(
    guestCart.items.map(async (item) => {
      const existingItem = await prisma.cartItem.findFirst({
        where: {
          cartId: userCart.id,
          productId: item.productId,
          variantId: item.variantId,
        },
      });

      if (existingItem) {
        return prisma.cartItem.update({
          where: { id: existingItem.id },
          data: { quantity: existingItem.quantity + item.quantity },
        });
      }
      return prisma.cartItem.create({
        data: {
          cartId: userCart.id,
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
        },
      });
    })
  );

  await prisma.cartItem.deleteMany({ where: { cartId: guestCart.id } });
  await prisma.cart.delete({ where: { id: guestCart.id } });
  return userCart;
}

async function findOrCreateCart({ userId, anonymousId }) {
  if (userId && anonymousId) {
    const mergedCart = await mergeGuestCart(userId, anonymousId);
    if (mergedCart) return mergedCart;
  }

  if (userId) {
    const userExists = await prisma.user.findUnique({ where: { id: userId } });
    if (!userExists) {
      if (anonymousId) {
        let cart = await prisma.cart.findUnique({ where: { anonymousId } });
        if (!cart) cart = await prisma.cart.create({ data: { anonymousId } });
        return cart;
      }
      return prisma.cart.create({ data: {} });
    }

    let cart = await prisma.cart.findFirst({ where: { userId } });
    if (!cart) cart = await prisma.cart.create({ data: { userId } });
    return cart;
  }

  if (anonymousId) {
    let cart = await prisma.cart.findUnique({ where: { anonymousId } });
    if (!cart) cart = await prisma.cart.create({ data: { anonymousId } });
    return cart;
  }

  return prisma.cart.create({ data: {} });
}

async function getCart(query) {
  const cart = await findOrCreateCart(query);
  return prisma.cart.findUnique({
    where: { id: cart.id },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              price: true,
              comparePrice: true,
              stock: true,
              reservedStock: true,
              images: { where: { isMain: true }, take: 1 },
            },
          },
          variant: true,
        },
      },
    },
  });
}

async function getAvailableStock(productId, variantId) {
  if (variantId) {
    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { stock: true, reservedStock: true },
    });
    if (!variant) {
      const error = new Error('Variante introuvable.');
      error.status = 404;
      throw error;
    }
    return variant.stock - variant.reservedStock;
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { stock: true, reservedStock: true },
  });
  if (!product) {
    const error = new Error('Produit introuvable.');
    error.status = 404;
    throw error;
  }
  return product.stock - product.reservedStock;
}

// ✅ Rejette les quantités non entières, négatives ou nulles.
// Piège classique évité ici : `data.quantity || 1` laissait passer -5 (car -5 est "truthy" en JS).
function assertValidQuantity(quantity) {
  if (!Number.isInteger(quantity) || quantity < 1) {
    const error = new Error('Quantité invalide.');
    error.status = 400;
    throw error;
  }
}

// ✅ Vérifie que l'article appartient bien au panier de l'appelant (owner = {userId, anonymousId})
// avant de le modifier ou de le supprimer — corrige la faille IDOR.
async function getOwnedCartItem(itemId, owner) {
  const cart = await findOrCreateCart(owner || {});
  const item = await prisma.cartItem.findFirst({
    where: { id: itemId, cartId: cart.id },
  });
  if (!item) {
    const error = new Error("Cet article n'existe pas dans votre panier.");
    error.status = 404;
    throw error;
  }
  return item;
}

async function addItem(data) {
  const quantity = data.quantity === undefined ? 1 : data.quantity;
  assertValidQuantity(quantity);

  const cart = await findOrCreateCart(data);
  const existingItem = await prisma.cartItem.findFirst({
    where: {
      cartId: cart.id,
      productId: data.productId,
      variantId: data.variantId,
    },
  });

  const requestedQuantity = (existingItem?.quantity || 0) + quantity;
  const available = await getAvailableStock(data.productId, data.variantId);
  if (requestedQuantity > available) {
    const error = new Error(`Stock insuffisant. ${available} disponible(s).`);
    error.status = 400;
    throw error;
  }

  if (existingItem) {
    return prisma.cartItem.update({
      where: { id: existingItem.id },
      data: { quantity: existingItem.quantity + quantity },
    });
  }

  return prisma.cartItem.create({
    data: {
      cartId: cart.id,
      productId: data.productId,
      variantId: data.variantId,
      quantity,
    },
  });
}

async function updateItem(itemId, data, owner) {
  assertValidQuantity(data.quantity);

  const item = await getOwnedCartItem(itemId, owner);

  const available = await getAvailableStock(item.productId, item.variantId);
  if (data.quantity > available) {
    const error = new Error(`Stock insuffisant. ${available} disponible(s).`);
    error.status = 400;
    throw error;
  }

  return prisma.cartItem.update({
    where: { id: itemId },
    data: { quantity: data.quantity },
  });
}

async function removeItem(itemId, owner) {
  await getOwnedCartItem(itemId, owner);
  return prisma.cartItem.delete({ where: { id: itemId } });
}

async function clearCart(query) {
  const cart = await findOrCreateCart(query);
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
}

module.exports = {
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
  getAvailableStock,
};