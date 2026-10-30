const express = require('express');
const prisma = require('../../config/database');
const { isAdmin } = require('../../middlewares/auth.middleware');
const {
  parsePagination,
  buildPaginationResponse,
  applyDateRangeFilter,
} = require('../../utils/pagination.utils');

const router = express.Router();

router.get('/', isAdmin, async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const where = {};

    if (req.query.module) where.module = req.query.module;
    if (req.query.userId) where.userId = req.query.userId;
    if (req.query.action) where.action = { contains: req.query.action };
    if (req.query.storeId) where.storeId = req.query.storeId;
    applyDateRangeFilter(where, 'createdAt', req.query);
    if (req.query.search) {
      const s = String(req.query.search).trim();
      where.OR = [
        { entityId: { contains: s } },
        { action: { contains: s } },
        { module: { contains: s } },
      ];
    }

    if (req.query.from || req.query.to) {
      where.createdAt = {};
      if (req.query.from) where.createdAt.gte = new Date(req.query.from);
      if (req.query.to) {
        const end = new Date(req.query.to);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    res.json(buildPaginationResponse({ data: logs, total, page, limit }));
  } catch (err) {
    next(err);
  }
});

module.exports = router;