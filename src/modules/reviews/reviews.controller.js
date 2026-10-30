const reviewsService = require('./reviews.service');

async function getProductReviews(req, res, next) {
  try {
    const reviews = await reviewsService.getProductReviews(req.params.productId);
    res.json(reviews);
  } catch (error) { next(error); }
}

async function createReview(req, res, next) {
  try {
    const review = await reviewsService.createReview(req.user.id, req.body);
    res.status(201).json(review);
  } catch (error) { next(error); }
}

async function deleteReview(req, res, next) {
  try {
    await reviewsService.deleteReview(req.user.id, req.params.id, req.user.role);
    res.status(204).end();
  } catch (error) { next(error); }
}

module.exports = { getProductReviews, createReview, deleteReview };
