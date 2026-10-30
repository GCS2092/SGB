const XLSX = require('xlsx');
const prisma = require('../../config/database');

// ─── Slugify ──────────────────────────────────────────────────
function slugify(str) {
  return str
    .toString()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Normalise les clés de correspondance (categorySlug, storeCode)
// pour tolérer espaces / casse sans pour autant changer les vraies valeurs stockées
function normKey(val) {
  return String(val || '').trim().toLowerCase();
}

function toBool(val) {
  if (typeof val === 'boolean') return val;
  const s = String(val).trim().toLowerCase();
  return ['vrai', 'true', '1', 'oui', 'yes'].includes(s);
}

// ─── Validation d'une ligne ─────────────────────────────────
function validateRow(row, categoriesMap, storesMap) {
  const errors = [];

  if (!row.name || !String(row.name).trim()) errors.push('Champ "name" manquant');
  if (row.price === undefined || row.price === '' || isNaN(Number(row.price)) || Number(row.price) < 0)
    errors.push('Champ "price" invalide (doit être un nombre positif)');
  if (row.stock === undefined || row.stock === '' || isNaN(Number(row.stock)) || Number(row.stock) < 0)
    errors.push('Champ "stock" invalide (doit être un nombre positif)');

  const catKey = normKey(row.categorySlug);
  if (!catKey) {
    errors.push('Champ "categorySlug" manquant (obligatoire — categoryId est requis en base)');
  } else if (!categoriesMap.has(catKey)) {
    errors.push(`Catégorie inconnue : "${row.categorySlug}"`);
  }

  const storeKey = normKey(row.storeCode);
  if (storeKey && !storesMap.has(storeKey)) {
    errors.push(`Boutique inconnue : "${row.storeCode}"`);
  }

  if (row.comparePrice && (isNaN(Number(row.comparePrice)) || Number(row.comparePrice) < 0))
    errors.push('Champ "comparePrice" invalide');

  return errors;
}

// ─── Import principal ───────────────────────────────────────
async function importFromBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const sheetName = workbook.SheetNames.find((n) => n.toLowerCase().includes('produit')) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (rows.length === 0) {
    const err = new Error('Le fichier ne contient aucune ligne de produit.');
    err.status = 400;
    throw err;
  }

  const variantSheetName = workbook.SheetNames.find((n) => n.toLowerCase().includes('variante'));
  const variantRows = variantSheetName
    ? XLSX.utils.sheet_to_json(workbook.Sheets[variantSheetName], { defval: '' })
    : [];

  // Préchargement des références — clés normalisées (trim + lowercase)
  const [categories, stores] = await Promise.all([
    prisma.category.findMany({ select: { id: true, slug: true } }),
    prisma.store.findMany({ select: { id: true, code: true } }),
  ]);
  const categoriesMap = new Map(categories.map((c) => [normKey(c.slug), c.id]));
  const storesMap = new Map(stores.map((s) => [normKey(s.code), s.id]));

  const report = { total: rows.length, created: 0, updated: 0, skipped: 0, errors: [], warnings: [] };

  // ─── PASSE 1 : validation + calcul des slugs finaux + détection doublons ───
  const prepared = [];
  const slugCount = new Map(); // slug final -> nb d'occurrences dans le fichier

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +2 : ligne 1 = en-têtes

    const rowErrors = validateRow(row, categoriesMap, storesMap);
    if (rowErrors.length > 0) {
      report.skipped++;
      report.errors.push({ row: rowNum, name: row.name || '(sans nom)', errors: rowErrors });
      continue;
    }

    const storeKey = normKey(row.storeCode);
    const storeId = storeKey ? storesMap.get(storeKey) : null;

    // Anti-collision : si un slug explicite est fourni on le respecte tel quel.
    // Sinon on dérive du nom, en suffixant par le storeCode pour éviter qu'un
    // même nom de produit dans 2 boutiques différentes ne pointe sur le même slug.
    let slug;
    if (row.slug && String(row.slug).trim()) {
      slug = slugify(row.slug);
    } else {
      slug = storeKey ? `${slugify(row.name)}-${storeKey}` : slugify(row.name);
    }

    slugCount.set(slug, (slugCount.get(slug) || 0) + 1);

    prepared.push({ rowNum, row, slug, storeId, catKey: normKey(row.categorySlug) });
  }

  // Doublons de slug DANS le fichier lui-même → on les exclut plutôt que de laisser
  // la ligne N écraser silencieusement la ligne N-1
  const duplicateSlugs = new Set([...slugCount.entries()].filter(([, c]) => c > 1).map(([s]) => s));

  // ─── PASSE 2 : écriture en base ───────────────────────────
  for (const item of prepared) {
    const { rowNum, row, slug, storeId, catKey } = item;

    if (duplicateSlugs.has(slug)) {
      report.skipped++;
      report.errors.push({
        row: rowNum,
        name: row.name,
        errors: [`Slug "${slug}" en doublon dans le fichier (ajoutez une colonne "slug" explicite pour différencier ces produits)`],
      });
      continue;
    }

    const variants = variantRows
      .filter((v) => slugify(v.productSlug) === slugify(row.slug || row.name))
      .map((v) => ({ size: v.size || '', color: v.color || '', stock: Number(v.stock) || 0 }));

    const data = {
      name: String(row.name).trim(),
      slug,
      description: row.description ? String(row.description) : '',
      price: Math.round(Number(row.price)),
      comparePrice: row.comparePrice ? Math.round(Number(row.comparePrice)) : null,
      purchasePrice: row.purchasePrice ? Math.round(Number(row.purchasePrice)) : null,
      stock: Math.round(Number(row.stock)),
      lowStockAlert: row.lowStockAlert ? Math.round(Number(row.lowStockAlert)) : 5,
      overstockAlert: row.overstockAlert ? Math.round(Number(row.overstockAlert)) : null,
      isActive: row.isActive !== undefined && row.isActive !== '' ? toBool(row.isActive) : true,
      isFeatured: row.isFeatured !== undefined && row.isFeatured !== '' ? toBool(row.isFeatured) : false,
      categoryId: categoriesMap.get(catKey),
      storeId: storeId || null,
    };

    try {
      const existing = await prisma.product.findUnique({ where: { slug } });

      if (existing) {
        await prisma.$transaction(async (tx) => {
          if (variants.length > 0) {
            await tx.productVariant.deleteMany({ where: { productId: existing.id } });
            await tx.productVariant.createMany({
              data: variants.map((v) => ({ ...v, productId: existing.id })),
            });
          }
          await tx.product.update({ where: { id: existing.id }, data });
        });
        report.updated++;
      } else {
        await prisma.product.create({
          data: {
            ...data,
            ...(variants.length > 0 && { variants: { create: variants } }),
          },
        });
        report.created++;
      }
    } catch (err) {
      report.skipped++;
      report.errors.push({ row: rowNum, name: row.name, errors: [`Erreur base de données : ${err.message}`] });
    }
  }

  return report;
}

module.exports = { importFromBuffer, slugify };