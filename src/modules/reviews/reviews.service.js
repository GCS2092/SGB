const prisma = require('../../config/database');

async function getProductReviews(productId) {
  return prisma.review.findMany({
    where: { productId, isVisible: true },
    include: { user: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

async function createReview(userId, data) {
  const existing = await prisma.review.findUnique({
    where: { userId_productId: { userId, productId: data.productId } },
  });
  if (existing) {
    const error = new Error('Vous avez déjà noté ce produit.');
    error.status = 400;
    throw error;
  }
  if (data.rating < 1 || data.rating > 5) {
    const error = new Error('La note doit être entre 1 et 5.');
    error.status = 400;
    throw error;
  }
  return prisma.review.create({ data: { userId, ...data } });
}

async function deleteReview(userId, reviewId, role) {
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) {
    const error = new Error('Avis introuvable.');
    error.status = 404;
    throw error;
  }
  if (review.userId !== userId && role !== 'ADMIN') {
    const error = new Error('Accès interdit.');
    error.status = 403;
    throw error;
  }
  return prisma.review.delete({ where: { id: reviewId } });
}

module.exports = { getProductReviews, createReview, deleteReview };
