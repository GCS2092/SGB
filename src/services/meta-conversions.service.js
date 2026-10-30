const crypto = require('crypto');
const axios = require('axios');
const prisma = require('../config/database');

const META_GRAPH_API_VERSION = 'v23.0';

function hash(value) {
  if (!value) return undefined;
  return crypto
    .createHash('sha256')
    .update(String(value).trim().toLowerCase())
    .digest('hex');
}

function normalizePhone(value) {
  return value ? String(value).replace(/[^0-9]/g, '') : undefined;
}

function isConfigured() {
  return Boolean(
    process.env.META_PIXEL_ID && process.env.META_CONVERSIONS_API_TOKEN,
  );
}

async function sendPurchaseEvent(orderId) {
  if (!isConfigured()) return { skipped: true, reason: 'Meta non configuré' };

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: true, items: true },
  });

  if (!order || order.paymentStatus !== 'PAID') {
    return { skipped: true, reason: 'Commande non payée' };
  }

  if (order.metaPurchaseSentAt) {
    return { skipped: true, reason: 'Conversion déjà envoyée' };
  }

  const attribution = order.attribution || {};
  const email = order.user?.email || order.guestEmail;
  const phone = order.user?.phone || order.guestPhone;
  const eventId = order.metaPurchaseEventId || `purchase_${order.orderNumber}`;
  const userData = {
    em: hash(email),
    ph: hash(normalizePhone(phone)),
    fbp: attribution.fbp || undefined,
    fbc: attribution.fbc || undefined,
  };

  Object.keys(userData).forEach((key) => {
    if (!userData[key]) delete userData[key];
  });

  const payload = {
    data: [{
      event_name: 'Purchase',
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: 'website',
      event_source_url: `${process.env.FRONTEND_URL || process.env.CLIENT_URL || ''}/orders/${order.orderNumber}`,
      user_data: userData,
      custom_data: {
        currency: 'XOF',
        value: order.total,
        order_id: order.orderNumber,
        content_type: 'product',
        content_ids: order.items.map((item) => item.productId),
        contents: order.items.map((item) => ({
          id: item.productId,
          quantity: item.quantity,
          item_price: item.price,
        })),
        num_items: order.items.reduce((total, item) => total + item.quantity, 0),
      },
    }],
  };

  if (process.env.META_TEST_EVENT_CODE) {
    payload.test_event_code = process.env.META_TEST_EVENT_CODE;
  }

  try {
    await axios.post(
      `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${process.env.META_PIXEL_ID}/events`,
      payload,
      {
        params: { access_token: process.env.META_CONVERSIONS_API_TOKEN },
        timeout: 5000,
      },
    );

    await prisma.order.update({
      where: { id: orderId },
      data: { metaPurchaseEventId: eventId, metaPurchaseSentAt: new Date(), metaPurchaseLastError: null },
    });
    return { sent: true, eventId };
  } catch (error) {
    const message = error.response?.data?.error?.message || error.message;
    console.error(`[Meta CAPI] Purchase ${order.orderNumber} non envoyé:`, message);
    await prisma.order.update({
      where: { id: orderId },
      data: { metaPurchaseLastError: String(message).slice(0, 500) },
    });
    return { sent: false, error: message };
  }
}

async function sendPurchaseEventSafely(orderId) {
  try {
    return await sendPurchaseEvent(orderId);
  } catch (error) {
    // Le marketing est optionnel : aucune erreur Meta/DB ne doit invalider le paiement.
    console.error(`[Meta CAPI] Impossible de traiter la conversion ${orderId}:`, error.message);
    return { sent: false, error: error.message };
  }
}

module.exports = { sendPurchaseEventSafely };
