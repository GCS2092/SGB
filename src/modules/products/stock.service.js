const prisma = require('../../config/database');

const IN_TYPES = ['IN', 'RETURN_IN', 'TRANSFER_IN'];

function availableQty(stock, reservedStock) {
  return Math.max(0, stock - (reservedStock || 0));
}

function httpError(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  return e;
}

async function mainStoreId(tx) {
  const s = (await tx.store.findFirst({ where: { isMain: true } })) || (await tx.store.findFirst());
  if (!s) throw httpError('Aucune boutique configuree.', 500);
  return s.id;
}

/** Verrouille (ou cree) la ligne StoreStock et la renvoie. */
async function lockStoreStock(tx, { storeId, productId, variantId = null }) {
  const rows = variantId
    ? await tx.$queryRaw`SELECT id, quantity, "reservedQuantity" FROM "StoreStock"
        WHERE "storeId" = ${storeId} AND "productId" = ${productId} AND "variantId" = ${variantId} FOR UPDATE`
    : await tx.$queryRaw`SELECT id, quantity, "reservedQuantity" FROM "StoreStock"
        WHERE "storeId" = ${storeId} AND "productId" = ${productId} AND "variantId" IS NULL FOR UPDATE`;
  if (rows[0]) return rows[0];
  try {
    await tx.storeStock.create({ data: { storeId, productId, variantId, quantity: 0, reservedQuantity: 0 } });
  } catch (e) {
    if (e.code !== 'P2002') throw e;
  }
  const again = variantId
    ? await tx.$queryRaw`SELECT id, quantity, "reservedQuantity" FROM "StoreStock"
        WHERE "storeId" = ${storeId} AND "productId" = ${productId} AND "variantId" = ${variantId} FOR UPDATE`
    : await tx.$queryRaw`SELECT id, quantity, "reservedQuantity" FROM "StoreStock"
        WHERE "storeId" = ${storeId} AND "productId" = ${productId} AND "variantId" IS NULL FOR UPDATE`;
  return again[0];
}

/**
 * Point d'entree unique : applique delta (+/-) sur une boutique et met a jour le total.
 * reservedDelta modifie la quantite reservee (meme boutique).
 */
async function adjustStock(tx, { storeId, productId, variantId = null, delta = 0, reservedDelta = 0, allowNegative = false }) {
  if (!storeId) storeId = await mainStoreId(tx);
  const row = await lockStoreStock(tx, { storeId, productId, variantId });
  const newQty = row.quantity + delta;
  const newRes = Math.max(0, row.reservedQuantity + reservedDelta);
  if (!allowNegative && newQty < 0) {
    throw httpError(`Stock insuffisant (disponible : ${row.quantity}).`);
  }
  if (!allowNegative && reservedDelta > 0 && newQty - newRes < 0) {
    throw httpError(`Stock insuffisant (disponible : ${availableQty(row.quantity, row.reservedQuantity)}).`);
  }
  await tx.storeStock.update({ where: { id: row.id }, data: { quantity: newQty, reservedQuantity: newRes } });
  const totalData = {};
  if (delta) totalData.stock = { increment: delta };
  if (reservedDelta) totalData.reservedStock = { increment: reservedDelta };
  if (Object.keys(totalData).length) {
    if (variantId) await tx.productVariant.update({ where: { id: variantId }, data: totalData });
    else await tx.product.update({ where: { id: productId }, data: totalData });
  }
  return { storeId, quantity: newQty, reservedQuantity: newRes };
}

/** Mouvement manuel (entree, perte, ajustement...) avec trace. */
async function applyMovement(tx, { storeId, productId, variantId = null, type, quantity, unitCost = null, reason = null, supplierId = null, reference = null, orderId = null, transferId = null, createdBy = null }) {
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty <= 0) throw httpError('Quantite invalide.');
  const delta = IN_TYPES.includes(type) ? qty : -qty;
  const res = await adjustStock(tx, { storeId, productId, variantId, delta });
  return tx.stockMovement.create({
    data: {
      storeId: res.storeId, productId, variantId: variantId || null, type, quantity: qty,
      unitCost, totalCost: unitCost != null ? unitCost * qty : null,
      reason, supplierId, reference, orderId, transferId, createdBy,
    },
  });
}

/** Transfert : -N source, +N destination, total inchange. */
async function transferStock(tx, { fromStoreId, toStoreId, items, transferId, transferNumber, createdBy }) {
  if (fromStoreId === toStoreId) throw httpError('Boutiques identiques.');
  for (const it of items) {
    const base = { productId: it.productId, variantId: it.variantId || null };
    await adjustStock(tx, { ...base, storeId: fromStoreId, delta: -it.quantity });
    await adjustStock(tx, { ...base, storeId: toStoreId, delta: it.quantity });
    // adjustStock a modifie le total deux fois (-N puis +N) : net = 0
    const common = { ...base, quantity: it.quantity, transferId, createdBy };
    await tx.stockMovement.create({ data: { ...common, storeId: fromStoreId, type: 'TRANSFER_OUT', reason: `Transfert ${transferNumber} vers destination` } });
    await tx.stockMovement.create({ data: { ...common, storeId: toStoreId, type: 'TRANSFER_IN', reason: `Transfert ${transferNumber} depuis source` } });
  }
}

async function loadItemStock(item, storeId = null) {
  const where = { productId: item.productId, variantId: item.variantId || null, ...(storeId && { storeId }) };
  const lines = await prisma.storeStock.findMany({ where });
  const stock = lines.reduce((a, l) => a + l.quantity, 0);
  const reservedStock = lines.reduce((a, l) => a + l.reservedQuantity, 0);
  const p = await prisma.product.findUnique({ where: { id: item.productId }, select: { id: true, name: true, purchasePrice: true } });
  if (!p) return null;
  return { productId: p.id, productName: p.name, variantId: item.variantId || null, stock, reservedStock, purchasePrice: p.purchasePrice };
}

async function checkStock(items, storeId = null) {
  const errors = [];
  for (const item of items) {
    const row = await loadItemStock(item, storeId);
    if (!row) { errors.push(`Produit introuvable : ${item.productId}`); continue; }
    const available = availableQty(row.stock, row.reservedStock);
    if (available < item.quantity) errors.push(`Stock insuffisant pour ${row.productName} - disponible : ${available}`);
  }
  return errors;
}

async function reserveStockItems(tx, items, storeId = null) {
  for (const item of items) {
    await adjustStock(tx, { storeId, productId: item.productId, variantId: item.variantId || null, reservedDelta: item.quantity });
  }
}

async function releaseReservation(tx, items, storeId = null) {
  for (const item of items) {
    await adjustStock(tx, { storeId, productId: item.productId, variantId: item.variantId || null, reservedDelta: -item.quantity, allowNegative: true });
  }
}

async function fulfillStockSale(tx, items, orderId, createdBy = null, storeId = null) {
  const sid = storeId || (await mainStoreId(tx));
  for (const item of items) {
    const p = await tx.product.findUnique({ where: { id: item.productId }, select: { purchasePrice: true } });
    const unitCost = p?.purchasePrice ?? null;
    const line = await lockStoreStock(tx, { storeId: sid, productId: item.productId, variantId: item.variantId || null });
    const release = Math.min(item.quantity, line.reservedQuantity || 0);
    await adjustStock(tx, { storeId: sid, productId: item.productId, variantId: item.variantId || null, delta: -item.quantity, reservedDelta: -release });
    await tx.stockMovement.create({
      data: {
        productId: item.productId, variantId: item.variantId || null, type: 'OUT_SALE', quantity: item.quantity,
        unitCost, totalCost: unitCost != null ? unitCost * item.quantity : null,
        reason: 'Vente commande', orderId, reference: orderId, storeId: sid, createdBy,
      },
    });
  }
}

async function restoreStockFromSale(tx, items, orderId, createdBy = null, storeId = null) {
  let sid = storeId;
  if (!sid && orderId) sid = (await tx.order.findUnique({ where: { id: orderId }, select: { storeId: true } }))?.storeId;
  sid = sid || (await mainStoreId(tx));
  for (const item of items) {
    await adjustStock(tx, { storeId: sid, productId: item.productId, variantId: item.variantId || null, delta: item.quantity });
    await tx.stockMovement.create({
      data: {
        productId: item.productId, variantId: item.variantId || null, type: 'RETURN_IN', quantity: item.quantity,
        reason: 'Annulation / retour commande', orderId, reference: orderId, storeId: sid, createdBy,
      },
    });
  }
}

module.exports = {
  availableQty, adjustStock, applyMovement, transferStock, lockStoreStock,
  checkStock, reserveStockItems, releaseReservation, fulfillStockSale, restoreStockFromSale,
};