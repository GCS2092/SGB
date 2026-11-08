const prisma = require('../../config/database');
const purchaseOrders = require('../purchase-orders/purchase-orders.service');

const OPEN_PO = ['DRAFT', 'ORDERED', 'PARTIAL'];
const httpErr = (m, s = 400) => { const e = new Error(m); e.status = s; return e; };
const keyOf = (productId, variantId) => `${productId}|${variantId || ''}`;

/** Articles sous leur seuil dans une boutique (stock reel StoreStock, variantes comprises). */
async function computeLowStock(storeId) {
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      status: { not: 'DRAFT' },
      OR: [{ storeStocks: { some: { storeId } } }, { storeId }],
    },
    select: {
      id: true, name: true, sku: true, lowStockAlert: true, overstockAlert: true, purchasePrice: true, supplierId: true,
      supplier: { select: { id: true, name: true } },
      variants: { select: { id: true, size: true, color: true, sku: true } },
      storeStocks: { where: { storeId }, select: { variantId: true, quantity: true, reservedQuantity: true } },
    },
  });

  const incomingRows = products.length
    ? await prisma.purchaseOrderItem.findMany({
      where: { productId: { in: products.map((p) => p.id) }, purchaseOrder: { storeId, status: { in: OPEN_PO } } },
      select: { productId: true, variantId: true, quantityOrdered: true, quantityReceived: true },
    })
    : [];
  const incoming = new Map();
  for (const r of incomingRows) {
    const k = keyOf(r.productId, r.variantId);
    incoming.set(k, (incoming.get(k) || 0) + Math.max(0, r.quantityOrdered - r.quantityReceived));
  }

  const out = [];
  for (const p of products) {
    const targets = p.variants.length ? p.variants.map((v) => ({ v })) : [{ v: null }];
    for (const { v } of targets) {
      const vid = v ? v.id : null;
      const rowsFor = p.storeStocks.filter((s) => (s.variantId || null) === vid);
      const qty = rowsFor.reduce((a, s) => a + s.quantity, 0);
      const res = rowsFor.reduce((a, s) => a + s.reservedQuantity, 0);
      const available = Math.max(0, qty - res);
      const threshold = p.lowStockAlert ?? 5;
      if (available > threshold) continue;
      let target = Math.max(1, threshold * 3);
      if (p.overstockAlert != null) target = Math.min(target, p.overstockAlert);
      const inc = incoming.get(keyOf(p.id, vid)) || 0;
      out.push({
        productId: p.id, variantId: vid,
        name: p.name, sku: (v && v.sku) || p.sku || null,
        variantLabel: v ? [v.size, v.color].filter(Boolean).join(' / ') || 'Variante' : null,
        available, threshold, incoming: inc,
        suggested: Math.max(0, target - available - inc),
        unitCost: p.purchasePrice ?? 0,
        supplierId: p.supplierId || null,
        supplierName: p.supplier?.name || null,
      });
    }
  }
  out.sort((a, b) => a.available - b.available || a.name.localeCompare(b.name, 'fr'));
  return out;
}

/** Cree un bon brouillon par fournisseur. Toutes les lignes sont validees avant toute creation. */
async function createOrdersFromLines({ storeId, lines, userId, ip }) {
  if (!storeId) throw httpErr('storeId requis.');
  if (!Array.isArray(lines) || !lines.length) throw httpErr('Aucune ligne sélectionnée.');
  const seen = new Set();
  const bySupplier = new Map();
  for (const [i, l] of lines.entries()) {
    const n = i + 1;
    if (!l.productId) throw httpErr(`Ligne ${n} : produit manquant.`);
    if (!l.supplierId) throw httpErr(`Ligne ${n} : choisissez un fournisseur.`);
    if (!Number.isInteger(l.quantity) || l.quantity < 1) throw httpErr(`Ligne ${n} : quantité entière positive requise.`);
    const cost = l.unitCost === undefined || l.unitCost === null ? 0 : l.unitCost;
    if (!Number.isInteger(cost) || cost < 0) throw httpErr(`Ligne ${n} : coût unitaire entier requis.`);
    const k = keyOf(l.productId, l.variantId);
    if (seen.has(k)) throw httpErr(`Ligne ${n} : article en double.`);
    seen.add(k);
    if (!bySupplier.has(l.supplierId)) bySupplier.set(l.supplierId, []);
    bySupplier.get(l.supplierId).push({ productId: l.productId, variantId: l.variantId || null, quantity: l.quantity, unitCost: cost });
  }
  const created = [];
  for (const [supplierId, items] of bySupplier) {
    const po = await purchaseOrders.create({
      storeId, supplierId, items,
      notes: 'Généré depuis la liste de réapprovisionnement', createdBy: userId, ip,
    });
    created.push({ id: po.id, poNumber: po.poNumber, supplierId, lines: items.length });
  }
  return created;
}

/** Une notification recapitulative par boutique et par destinataire (pas de spam). */
async function scanLowStock() {
  const stores = await prisma.store.findMany({ where: { isActive: true }, select: { id: true, name: true } });
  let notified = 0;
  for (const store of stores) {
    const items = await computeLowStock(store.id);
    if (!items.length) continue;
    const empty = items.filter((i) => i.available <= 0).length;
    const link = `/admin/replenishment#${store.id}`;
    const message = `${items.length} article(s) sous le seuil d’alerte${empty ? `, dont ${empty} en rupture` : ''} (${store.name}).`;
    const users = await prisma.user.findMany({
      where: { isActive: true, OR: [{ role: 'ADMIN' }, { userStores: { some: { storeId: store.id } } }] },
      select: { id: true },
    });
    for (const u of users) {
      const last = await prisma.notification.findFirst({ where: { userId: u.id, type: 'LOW_STOCK', link }, orderBy: { createdAt: 'desc' } });
      if (last && !last.isRead) { await prisma.notification.update({ where: { id: last.id }, data: { message } }); continue; }
      if (last && Date.now() - new Date(last.createdAt).getTime() < 24 * 3600 * 1000) continue;
      await prisma.notification.create({ data: { userId: u.id, type: 'LOW_STOCK', title: 'Stock bas', message, link } });
      notified++;
    }
  }
  return { stores: stores.length, notified };
}

let started = false;
function startLowStockJob() {
  if (started) return;
  started = true;
  const run = () => scanLowStock().catch((e) => console.error('[low-stock scan]', e.message));
  try {
    require('node-cron').schedule('0 * * * *', run);
    const t = setTimeout(run, 60 * 1000);
    if (t.unref) t.unref();
  } catch (e) {
    console.error('[low-stock job] non démarré :', e.message);
  }
}

module.exports = { computeLowStock, createOrdersFromLines, scanLowStock, startLowStockJob };