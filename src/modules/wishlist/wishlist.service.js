const prisma = require('../../config/database');

async function getWishlist(userId) {
  return prisma.wishlist.findMany({
    where: { userId },
    include: { product: { include: { images: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

async function addToWishlist(userId, productId) {
  const existing = await prisma.wishlist.findUnique({
    where: { userId_productId: { userId, productId } },
  });
  if (existing) {
    const error = new Error('Produit déjà dans les favoris.');
    error.status = 400;
    throw error;
  }
  return prisma.wishlist.create({ data: { userId, productId } });
}

async function removeFromWishlist(userId, productId) {
  const existing = await prisma.wishlist.findUnique({
    where: { userId_productId: { userId, productId } },
  });
  if (!existing) {
    const error = new Error('Produit non trouvé dans les favoris.');
    error.status = 404;
    throw error;
  }
  return prisma.wishlist.delete({
    where: { userId_productId: { userId, productId } },
  });
}

module.exports = { getWishlist, addToWishlist, removeFromWishlist };
