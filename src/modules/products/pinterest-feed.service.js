const prisma = require('../../config/database');

const SITE_URL = 'https://www.sonshop.beauty';
const CURRENCY = 'XOF';

// Taxonomie Google Product Category (GPC) — https://support.google.com/merchants/answer/6324436
// Mappe le nom de catégorie interne vers la catégorie Google officielle.
// Clé = product.category.name (tel qu'il existe dans ta base), en minuscule.
// Valeur par défaut si aucune correspondance trouvée : vêtements génériques.
const GPC_DEFAULT = 'Apparel & Accessories > Clothing';

const GPC_MAP = {
  'boubou': 'Apparel & Accessories > Clothing > Dresses',
  'boubou imperial': 'Apparel & Accessories > Clothing > Dresses',
  'boubou impérial': 'Apparel & Accessories > Clothing > Dresses',
  'imprime brode': 'Apparel & Accessories > Clothing > Dresses',
  'imprimé & brodé': 'Apparel & Accessories > Clothing > Dresses',
  'kafka': 'Apparel & Accessories > Clothing > Dresses', // Kaftan
  'motif tie-dye': 'Apparel & Accessories > Clothing > Dresses',
  'stripe chic': 'Apparel & Accessories > Clothing > Dresses',
  'tie-dye': 'Apparel & Accessories > Clothing > Dresses',
};

function getGoogleProductCategory(product) {
  const categoryName = product.category?.name?.toLowerCase().trim();
  if (categoryName && GPC_MAP[categoryName]) {
    return GPC_MAP[categoryName];
  }
  return GPC_DEFAULT;
}

function escapeCdata(str = '') {
  // Empeche une chaine contenant "]]>" de casser le CDATA
  return String(str).replace(/]]>/g, ']]]]><![CDATA[>');
}

function isValidImageUrl(url) {
  return typeof url === 'string' && /^https?:\/\/.+/i.test(url.trim());
}

function buildItemXml(product) {
  // On ne garde que les images dont l'URL a l'air valide (http/https non vide)
  const validImages = (product.images || []).filter((img) => isValidImageUrl(img.url));
  const mainImage = validImages.find((img) => img.isMain) || validImages[0];

  if (!mainImage) {
    console.warn(`[pinterest-feed] Produit ignoré (pas d'image valide) : ${product.id} - ${product.name}`);
    return ''; // Pinterest exige une image, on ignore les produits sans photo valide
  }

  const availability = product.stock > 0 ? 'in stock' : 'out of stock';
  const price = `${Number(product.price).toFixed(2)} ${CURRENCY}`;
  const link = `${SITE_URL}/products/${product.slug}`;
  const googleProductCategory = getGoogleProductCategory(product);

  return `
  <item>
    <g:id>${product.id}</g:id>
    <title><![CDATA[${escapeCdata(product.name)}]]></title>
    <description><![CDATA[${escapeCdata(product.description)}]]></description>
    <link>${link}</link>
    <g:image_link>${mainImage.url}</g:image_link>
    <g:price>${price}</g:price>
    <g:availability>${availability}</g:availability>
    <g:condition>new</g:condition>
    <g:brand><![CDATA[SonShop]]></g:brand>
    <g:google_product_category><![CDATA[${googleProductCategory}]]></g:google_product_category>
    ${product.category ? `<g:product_type><![CDATA[${escapeCdata(product.category.name)}]]></g:product_type>` : ''}
  </item>`;
}

async function generatePinterestFeed() {
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      status: 'PUBLISHED',
    },
    include: { images: true, category: true },
    orderBy: { createdAt: 'desc' },
  });

  const items = products.map(buildItemXml).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
  <title>SonShop - Catalogue produits</title>
  <link>${SITE_URL}</link>
  <description>Catalogue produits SonShop pour Pinterest Catalogs</description>
  ${items}
</channel>
</rss>`;
}

module.exports = { generatePinterestFeed };