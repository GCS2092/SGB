const prisma = require('../../config/database');
const {
  isCouponValidForStore,
  resolveStoreIdForCatalog,
} = require('../stores/store.service');

async function validateCoupon(code, orderAmount, storeId = null) {
  const coupon = await prisma.coupon.findUnique({ where: { code } });
  if (!coupon || !coupon.isActive) {
    const error = new Error('Code promo invalide ou expiré.');
    error.status = 400;
    throw error;
  }
  if (coupon.expiresAt && new Date() > coupon.expiresAt) {
    const error = new Error('Code promo expiré.');
    error.status = 400;
    throw error;
  }
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
    const error = new Error('Code promo épuisé.');
    error.status = 400;
    throw error;
  }
  if (coupon.minOrderAmount && orderAmount < coupon.minOrderAmount) {
    const error = new Error(`Montant minimum requis : ${coupon.minOrderAmount} FCFA`);
    error.status = 400;
    throw error;
  }

  const effectiveStoreId = await resolveStoreIdForCatalog(storeId);
  if (!isCouponValidForStore(coupon.storeId, effectiveStoreId)) {
    const error = new Error('Ce code promo n\'est pas valable pour cette boutique.');
    error.status = 400;
    throw error;
  }

  const discount = coupon.type === 'PERCENTAGE'
    ? Math.floor(orderAmount * coupon.value / 100)
    : coupon.value;

  return { coupon, discount };
}

async function getCoupons(query = {}) {
  const where = {};
  if (query.storeId) {
    where.OR = [{ storeId: query.storeId }, { storeId: null }];
  }
  return prisma.coupon.findMany({ where, orderBy: { createdAt: 'desc' } });
}

async function createCoupon(data) {
  return prisma.coupon.create({ data });
}

async function updateCoupon(id, data) {
  return prisma.coupon.update({ where: { id }, data });
}

async function deleteCoupon(id) {
  return prisma.coupon.delete({ where: { id } });
}

async function getPublicCoupons(storeId = null) {
  const effectiveStoreId = await resolveStoreIdForCatalog(storeId);
  const all = await prisma.coupon.findMany({
    where: {
      isActive: true,
      AND: [
        {
          OR: [
            { storeId: effectiveStoreId },
            { storeId: null },
          ],
        },
        {
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
      ],
    },
    select: {
      code: true,
      type: true,
      value: true,
      expiresAt: true,
      minOrderAmount: true,
      maxUses: true,
      usedCount: true,
      storeId: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  return all.filter(c => c.maxUses === null || c.usedCount < c.maxUses);
}

module.exports = { validateCoupon, getCoupons, createCoupon, updateCoupon, deleteCoupon, getPublicCoupons };
