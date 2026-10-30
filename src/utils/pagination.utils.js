function parsePagination(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

function buildPaginationResponse({ data, total, page, limit }) {
  const totalPages = Math.max(1, Math.ceil(total / limit) || 1);
  return {
    data,
    total,
    page,
    limit,
    totalPages,
    pagination: {
      total,
      page,
      pageSize: limit,
      totalPages,
    },
  };
}

/** Filtre Prisma sur un champ DateTime (from / to au format YYYY-MM-DD). */
function applyDateRangeFilter(where, field, query) {
  if (!query.from && !query.to) return where;

  where[field] = {};
  if (query.from) {
    where[field].gte = new Date(query.from);
  }
  if (query.to) {
    const end = new Date(query.to);
    end.setHours(23, 59, 59, 999);
    where[field].lte = end;
  }
  return where;
}

module.exports = {
  parsePagination,
  buildPaginationResponse,
  applyDateRangeFilter,
};
