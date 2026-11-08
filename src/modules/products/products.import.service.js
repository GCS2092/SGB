const XLSX = require('xlsx');
const prisma = require('../../config/database');

function slugify(str) {
  return str
    .toString()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function normKey(val) {
  return String(val || '').trim().toLowerCase();
}

function toBool(val) {
  if (typeof val === 'boolean') return val;
  const s = String(val).trim().toLowerCase();
  return ['vrai', 'true', '1', 'oui', 'yes'].includes(s);
}

const has = (v) => v !== undefined && v !== null && String(v).trim() !== '';
const str = (v) => (has(v) ? String(v).trim() : null);
const toInt = (v) => Math.round(Number(v));

const STATUS_MAP = {
  draft: 'DRAFT', brouillon: 'DRAFT',
  published: 'PUBLISHED', publie: 'PUBLISHED', 'publié': 'PUBLISHED',
  out_of_stock: 'OUT_OF_STOCK', rupture: 'OUT_OF_STOCK',
};
const normStatus = (v) => STATUS_MAP[String(v).trim().toLowerCase()] || null;

function validateRow(row, categoriesMap, storesMap) {
  const errors = [];

  if (!row.name || !String(row.name).trim()) errors.push('Champ "name" manquant');
  if (!has(row.price) || isNaN(Number(row.price)) || Number(row.price) < 0)
    errors.push('Champ "price" invalide (doit être un nombre positif)');

  const catKey = normKey(row.categorySlug);
  if (!catKey) {
    errors.push('Champ "categorySlug" manquant (obligatoire)');
  } else if (!categoriesMap.has(catKey)) {
    errors.push(`Catégorie inconnue : "${row.categorySlug}"`);
  }

  const storeKey = normKey(row.storeCode);
  if (storeKey && !storesMap.has(storeKey)) errors.push(`Boutique inconnue : "${row.storeCode}"`);

  if (has(row.comparePrice) && (isNaN(Number(row.comparePrice)) || Number(row.comparePrice) < 0)) errors.push('Champ "comparePrice" invalide');
  if (has(row.purchasePrice) && (isNaN(Number(row.purchasePrice)) || Number(row.purchasePrice) < 0)) errors.push('Champ "purchasePrice" invalide');
  if (has(row.lowStockAlert) && (isNaN(Number(row.lowStockAlert)) || Number(row.lowStockAlert) < 0)) errors.push('Champ "lowStockAlert" invalide');
  if (has(row.overstockAlert) && (isNaN(Number(row.overstockAlert)) || Number(row.overstockAlert) < 0)) errors.push('Champ "overstockAlert" invalide');
  if (has(row.status) && !normStatus(row.status)) errors.push(`Champ "status" invalide : "${row.status}" (DRAFT, PUBLISHED ou OUT_OF_STOCK)`);

  return errors;
}

async function importFromBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const sheetName = workbook.SheetNames.find((n) => n.toLowerCase().includes('produit')) || workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

  if (rows.length === 0) {
    const err = new Error('Le fichier ne contient aucune ligne de produit.');
    err.status = 400;
    throw err;
  }

  const variantSheetName = workbook.SheetNames.find((n) => n.toLowerCase().includes('variante'));
  const variantRows = variantSheetName
    ? XLSX.utils.sheet_to_json(workbook.Sheets[variantSheetName], { defval: '' })
    : [];

  const [categories, stores] = await Promise.all([
    prisma.category.findMany({ select: { id: true, slug: true } }),
    prisma.store.findMany({ select: { id: true, code: true } }),
  ]);
  const categoriesMap = new Map(categories.map((c) => [normKey(c.slug), c.id]));
  const storesMap = new Map(stores.map((s) => [normKey(s.code), s.id]));

  const report = { total: rows.length, created: 0, updated: 0, skipped: 0, errors: [], warnings: [] };

  if (rows.some((r) => has(r.stock) && Number(r.stock) > 0) || variantRows.some((v) => has(v.stock) && Number(v.stock) > 0)) {
    report.warnings.push('La colonne « stock » du fichier est ignorée : le stock se saisit dans « Mouvements » pour être rattaché à une boutique. Les produits créés démarrent à 0 et les produits existants gardent leur stock.');
  }

  const prepared = [];
  const slugCount = new Map();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const rowErrors = validateRow(row, categoriesMap, storesMap);
    if (rowErrors.length > 0) {
      report.skipped++;
      report.errors.push({ row: rowNum, name: row.name || '(sans nom)', errors: rowErrors });
      continue;
    }

    const storeKey = normKey(row.storeCode);
    const storeId = storeKey ? storesMap.get(storeKey) : null;

    let slug;
    if (row.slug && String(row.slug).trim()) slug = slugify(row.slug);
    else slug = storeKey ? `${slugify(row.name)}-${storeKey}` : slugify(row.name);

    slugCount.set(slug, (slugCount.get(slug) || 0) + 1);
    prepared.push({ rowNum, row, slug, storeId, catKey: normKey(row.categorySlug) });
  }

  const duplicateSlugs = new Set([...slugCount.entries()].filter(([, c]) => c > 1).map(([s]) => s));

  for (const item of prepared) {
    const { rowNum, row, slug, storeId, catKey } = item;

    if (duplicateSlugs.has(slug)) {
      report.skipped++;
      report.errors.push({
        row: rowNum, name: row.name,
        errors: [`Slug "${slug}" en doublon dans le fichier (ajoutez une colonne "slug" explicite pour différencier ces produits)`],
      });
      continue;
    }

    const keys = new Set([slug, slugify(row.slug || row.name)]);
    const variants = variantRows
      .filter((v) => has(v.productSlug) && keys.has(slugify(v.productSlug)))
      .map((v) => ({
        size: has(v.size) ? String(v.size).trim() : '',
        color: has(v.color) ? String(v.color).trim() : '',
        sku: str(v.sku),
        barcode: str(v.barcode),
      }))
      .filter((v) => v.size || v.color);

    // Champs toujours pilotes par le fichier (le stock n'en fait JAMAIS partie)
    const common = {
      name: String(row.name).trim(),
      slug,
      price: toInt(row.price),
      comparePrice: has(row.comparePrice) ? toInt(row.comparePrice) : null,
      purchasePrice: has(row.purchasePrice) ? toInt(row.purchasePrice) : null,
      categoryId: categoriesMap.get(catKey),
      storeId: storeId || null,
    };
    // Champs optionnels : modifies seulement si la cellule est renseignee
    const optional = {};
    if (has(row.description)) optional.description = String(row.description);
    if (has(row.lowStockAlert)) optional.lowStockAlert = toInt(row.lowStockAlert);
    if (has(row.overstockAlert)) optional.overstockAlert = toInt(row.overstockAlert);
    if (has(row.isActive)) optional.isActive = toBool(row.isActive);
    if (has(row.isFeatured)) optional.isFeatured = toBool(row.isFeatured);
    if (has(row.sku)) optional.sku = String(row.sku).trim();
    if (has(row.barcode)) optional.barcode = String(row.barcode).trim();
    if (has(row.status)) optional.status = normStatus(row.status);

    try {
      const existing = await prisma.product.findUnique({ where: { slug } });

      if (existing) {
        await prisma.$transaction(async (tx) => {
          for (const v of variants) {
            await tx.productVariant.upsert({
              where: { productId_size_color: { productId: existing.id, size: v.size, color: v.color } },
              update: { ...(v.sku && { sku: v.sku }), ...(v.barcode && { barcode: v.barcode }) },
              create: { productId: existing.id, size: v.size, color: v.color, stock: 0, sku: v.sku, barcode: v.barcode },
            });
          }
          await tx.product.update({ where: { id: existing.id }, data: { ...common, ...optional } });
        });
        report.updated++;
      } else {
        await prisma.product.create({
          data: {
            description: '', lowStockAlert: 5, isActive: true, isFeatured: false, stock: 0,
            ...common, ...optional,
            ...(variants.length > 0 && { variants: { create: variants.map((v) => ({ ...v, stock: 0 })) } }),
          },
        });
        report.created++;
      }
    } catch (err) {
      const msg = err.code === 'P2002' ? 'SKU ou code-barres déjà utilisé par un autre produit / variante' : err.message;
      report.skipped++;
      report.errors.push({ row: rowNum, name: row.name, errors: [`Erreur base de données : ${msg}`] });
    }
  }

  return report;
}

module.exports = { importFromBuffer, slugify };