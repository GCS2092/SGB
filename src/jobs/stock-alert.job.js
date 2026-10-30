const prisma = require('../config/database');
const { sendEmail } = require('../config/email');
const { buildStockAlertEmail } = require('../utils/email.utils');
const { getSettings } = require('../modules/settings/settings.service');

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

async function checkLowStockAndNotify() {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    console.warn('[stock-alert] ADMIN_EMAIL non configuré — alerte ignorée');
    return { sent: false, reason: 'no_admin_email' };
  }

  const products = await prisma.product.findMany({
    where: { isActive: true },
    include: { store: { select: { name: true } } },
  });

  const outOfStock = products.filter((p) => p.stock === 0);
  const lowStock = products.filter((p) => p.stock > 0 && p.stock <= p.lowStockAlert);

  // Rien à signaler aujourd'hui → pas d'email (évite le spam quotidien)
  if (outOfStock.length === 0 && lowStock.length === 0) {
    return { sent: false, reason: 'nothing_to_report' };
  }

  const settings = await getSettings();
  const storeName = settings.company_name || 'SGB';

  const { subject, html } = buildStockAlertEmail({
    outOfStock: outOfStock.map((p) => ({
      name: p.name,
      store: p.store?.name || null,
    })),
    lowStock: lowStock.map((p) => ({
      name: p.name,
      stock: p.stock,
      alert: p.lowStockAlert,
      store: p.store?.name || null,
    })),
    storeName,
    adminUrl: `${CLIENT_URL}/admin/products`,
  });

  await sendEmail({ to: adminEmail, subject, html });

  return {
    sent: true,
    outOfStockCount: outOfStock.length,
    lowStockCount: lowStock.length,
  };
}

module.exports = { checkLowStockAndNotify };