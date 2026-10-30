const wishlistService = require('./wishlist.service');

async function getWishlist(req, res, next) {
  try {
    const wishlist = await wishlistService.getWishlist(req.user.id);
    res.json(wishlist);
  } catch (error) { next(error); }
}

async function addToWishlist(req, res, next) {
  try {
    const item = await wishlistService.addToWishlist(req.user.id, req.body.productId);
    res.status(201).json(item);
  } catch (error) { next(error); }
}

async function removeFromWishlist(req, res, next) {
  try {
    await wishlistService.removeFromWishlist(req.user.id, req.params.productId);
    res.status(204).end();
  } catch (error) { next(error); }
}

module.exports = { getWishlist, addToWishlist, removeFromWishlist };
