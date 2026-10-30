const prisma = require('../../config/database');
const { buildProductStoreFilter } = require('../stores/store.service');

async function collectReportData(storeId, from, to) {
  // ── Filtre de dates ──────────────────────────────────────────
  // ⚠️ FIX : new Date('2026-06-21') = 2026-06-21T00:00:00.000Z (minuit pile).
  // Avec lte sur cette valeur, toute dépense/commande créée après minuit
  // le dernier jour était exclue. On pousse donc "to" à 23:59:59.999
  // pour couvrir la journée entière.
  const toEndOfDay = new Date(to);
  toEndOfDay.setHours(23, 59, 59, 999);
  const dateFilter = { gte: new Date(from), lte: toEndOfDay };

  // ── Commandes ──────────────────────────────────────────────
  const orders = await prisma.order.findMany({
    where: { storeId, createdAt: dateFilter },
    include: { items: true, payments: true, user: true },
  });

  const totalOrders = orders.length;
  const ordersByStatus = orders.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  const deliveredOrders = orders.filter((o) => o.status === 'DELIVERED');
  const chiffreAffaires = deliveredOrders.reduce((sum, o) => sum + o.total, 0);

  // Top clients
  const clientMap = {};
  for (const o of orders) {
    const name = o.user
      ? `${o.user.firstName} ${o.user.lastName}`
      : o.guestName || 'Inconnu';
    const email = o.user?.email || o.guestEmail || '';
    const key = email || name;
    if (!clientMap[key]) clientMap[key] = { name, email, total: 0, count: 0 };
    clientMap[key].total += o.total;
    clientMap[key].count += 1;
  }
  const topClients = Object.values(clientMap)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // ── Produits vendus ────────────────────────────────────────
  const productMap = {};
  for (const o of deliveredOrders) {
    for (const item of o.items) {
      if (!productMap[item.productId]) {
        productMap[item.productId] = {
          name: item.productName,
          quantity: 0,
          revenue: 0,
        };
      }
      productMap[item.productId].quantity += item.quantity;
      productMap[item.productId].revenue += item.subtotal;
    }
  }
  const topProducts = Object.values(productMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // ── Factures ───────────────────────────────────────────────
  const invoices = await prisma.invoice.findMany({
    where: { storeId, createdAt: dateFilter },
  });
  const invoicesByStatus = invoices.reduce((acc, i) => {
    acc[i.status] = (acc[i.status] || 0) + 1;
    return acc;
  }, {});
  const totalInvoiced = invoices.reduce((sum, i) => sum + i.total, 0);

  // ── Stock ──────────────────────────────────────────────────
  const products = await prisma.product.findMany({
    where: buildProductStoreFilter(storeId),
    include: { variants: true, category: true },
  });

  const lowStock = products.filter((p) => p.stock <= p.lowStockAlert);
  const outOfStock = products.filter((p) => p.stock === 0);
  const totalStockValue = products.reduce(
    (sum, p) => sum + p.stock * (p.purchasePrice || 0),
    0,
  );

  const stockMovements = await prisma.stockMovement.findMany({
    where: { storeId, createdAt: dateFilter },
    include: { product: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  // ── Dépenses ───────────────────────────────────────────────
  // DIAGNOSTIC : on log le storeId utilisé + le nombre de dépenses
  // trouvées AVANT le filtre storeId, pour vérifier si le storeId
  // est la cause d'un total à 0 (dépenses existantes mais sur un
  // storeId différent, ou enregistrées avec storeId null).
  const allExpensesInPeriod = await prisma.expense.findMany({
    where: { date: dateFilter },
    select: { id: true, storeId: true, amount: true, category: true, date: true },
  });
  console.log(`💸 [collectReportData] storeId demandé = ${storeId}`);
  console.log(`💸 [collectReportData] dépenses trouvées (toutes boutiques) sur la période = ${allExpensesInPeriod.length}`);
  if (allExpensesInPeriod.length > 0) {
    const storeIdsFound = [...new Set(allExpensesInPeriod.map((e) => e.storeId))];
    console.log(`💸 [collectReportData] storeId(s) présents dans ces dépenses = ${JSON.stringify(storeIdsFound)}`);
  }

  const expenses = await prisma.expense.findMany({
    where: { storeId, date: dateFilter },
  });
  console.log(`💸 [collectReportData] dépenses retenues pour storeId=${storeId} = ${expenses.length}`);

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const expensesByCategory = expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {});

  // ── Bénéfice estimé ────────────────────────────────────────
  const cogs = deliveredOrders.reduce((sum, o) => {
    return (
      sum +
      o.items.reduce((s, item) => {
        const product = products.find((p) => p.id === item.productId);
        return s + (product?.purchasePrice || 0) * item.quantity;
      }, 0)
    );
  }, 0);
  const beneficeEstime = chiffreAffaires - cogs - totalExpenses;

  return {
    period: { from, to },
    financial: {
      chiffreAffaires,
      totalExpenses,
      cogs,
      beneficeEstime,
      totalInvoiced,
    },
    orders: {
      total: totalOrders,
      byStatus: ordersByStatus,
      topClients,
    },
    products: {
      topProducts,
    },
    invoices: {
      total: invoices.length,
      byStatus: invoicesByStatus,
      totalInvoiced,
    },
    stock: {
      totalProducts: products.length,
      totalStockValue,
      lowStock: lowStock.map((p) => ({
        name: p.name,
        stock: p.stock,
        alert: p.lowStockAlert,
      })),
      outOfStock: outOfStock.map((p) => ({ name: p.name })),
      recentMovements: stockMovements.map((m) => ({
        product: m.product.name,
        type: m.type,
        quantity: m.quantity,
        date: m.createdAt,
      })),
    },
    expenses: {
      total: totalExpenses,
      byCategory: expensesByCategory,
    },
  };
}

module.exports = { collectReportData };