const XLSX = require('xlsx');
const prisma = require('../../config/database');

async function generateTemplate() {
  const categories = await prisma.category.findMany({ select: { slug: true, name: true } });
  const stores = await prisma.store.findMany({ select: { code: true, name: true } });

  const wb = XLSX.utils.book_new();

  const exampleRow = [{
    name: 'Robe Wax Élégante', slug: '', sku: 'ROBE-WAX-01', barcode: '', description: 'Belle robe en wax',
    price: 25000, comparePrice: 30000, purchasePrice: 15000,
    lowStockAlert: 5, overstockAlert: '', status: 'PUBLISHED', isActive: 'VRAI', isFeatured: 'FAUX',
    categorySlug: categories[0]?.slug || 'a-remplir', storeCode: stores[0]?.code || '',
  }];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exampleRow), 'Produits');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { productSlug: 'robe-wax-elegante', size: 'M', color: 'Rouge', sku: '', barcode: '' },
  ]), 'Variantes');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(categories), 'Ref_Categories');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stores), 'Ref_Boutiques');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function exportProducts() {
  const products = await prisma.product.findMany({
    include: { category: true, store: true, variants: true },
    orderBy: { name: 'asc' },
  });

  const totalStock = (p) => (p.variants.length ? p.variants.reduce((a, v) => a + v.stock, 0) : p.stock);

  const rows = products.map((p) => ({
    name: p.name, slug: p.slug, sku: p.sku || '', barcode: p.barcode || '', description: p.description,
    price: p.price, comparePrice: p.comparePrice ?? '', purchasePrice: p.purchasePrice ?? '',
    stock: totalStock(p), lowStockAlert: p.lowStockAlert, overstockAlert: p.overstockAlert ?? '',
    status: p.status, isActive: p.isActive ? 'VRAI' : 'FAUX', isFeatured: p.isFeatured ? 'VRAI' : 'FAUX',
    categorySlug: p.category?.slug || '', storeCode: p.store?.code || '',
  }));

  const variantRows = products.flatMap((p) =>
    p.variants.map((v) => ({ productSlug: p.slug, size: v.size, color: v.color, sku: v.sku || '', barcode: v.barcode || '', stock: v.stock }))
  );

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Produits');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(variantRows), 'Variantes');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { generateTemplate, exportProducts };