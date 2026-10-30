const prisma = require('../../config/database');
const { sendEmail } = require('../../config/email');
const { notifyUser } = require('../../services/notification.service');

// ─── Créer une alerte (utilisateur connecté ou invité) ────────────────────────
async function createAlert({ userId, email, productId, variantId }) {
  if (!userId && !email) {
    const error = new Error('Email requis pour une alerte sans compte.');
    error.status = 400;
    throw error;
  }

  // Évite les doublons non notifiés
  const existing = await prisma.stockAlert.findFirst({
    where: {
      productId,
      variantId: variantId || null,
      notifiedAt: null,
      ...(userId ? { userId } : { email }),
    },
  });
  if (existing) return existing;

  return prisma.stockAlert.create({
    data: { userId: userId || null, email: email || null, productId, variantId: variantId || null },
  });
}

// ─── Déclenché quand un stock repasse de 0 (ou insuffisant) à disponible ──────
async function notifyStockAlerts({ productId, variantId = null }) {
  const alerts = await prisma.stockAlert.findMany({
    where: { productId, variantId, notifiedAt: null },
    include: {
      user: { select: { id: true, email: true, firstName: true } },
      product: { select: { name: true, slug: true } },
    },
  });

  if (alerts.length === 0) return;

  const product = alerts[0].product;
  const link = `/products/${product.slug}`;

  for (const alert of alerts) {
    // Push + notif DB si compte connecté
    if (alert.userId) {
      await notifyUser({
        userId: alert.userId,
        type: 'PROMO',
        title: '🎉 De nouveau disponible !',
        message: `${product.name} est de nouveau en stock.`,
        link,
      }).catch((err) => console.error('❌ Erreur notif stock alert:', err.message));
    }

    // Email (compte connecté avec email, ou invité)
    const targetEmail = alert.user?.email || alert.email;
    if (targetEmail) {
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      sendEmail({
        to: targetEmail,
        subject: `${product.name} est de nouveau disponible !`,
        html: `
          <p>Bonne nouvelle${alert.user?.firstName ? ` ${alert.user.firstName}` : ''} !</p>
          <p><strong>${product.name}</strong> vient d'être réapprovisionné.</p>
          <p><a href="${clientUrl}${link}">Voir le produit</a></p>
        `,
      }).catch((err) => console.error('❌ Erreur email stock alert:', err.message));
    }
  }

  await prisma.stockAlert.updateMany({
    where: { id: { in: alerts.map((a) => a.id) } },
    data: { notifiedAt: new Date() },
  });

  console.log(`✅ ${alerts.length} alerte(s) stock notifiée(s) pour ${product.name}`);
}

module.exports = { createAlert, notifyStockAlerts };