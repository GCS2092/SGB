const prisma = require('../../config/database');
const { sendEmail } = require('../../config/email');
const { buildOrderConfirmationEmail, buildOrderStatusEmail, buildAdminNewOrderEmail } = require('../../utils/email.utils');
const { generateOrderNumber } = require('../../utils/order.utils');
const {
  parsePagination,
  buildPaginationResponse,
  applyDateRangeFilter,
} = require('../../utils/pagination.utils');
const { checkStock, reserveStockItems } = require('../products/stock.service');
const { logAudit } = require('../../services/audit.service');
const { changeOrderStatusAtomic } = require('./order-fulfillment.service');
const {
  resolveStoreForOrder,
  computeStoreDiscount,
  isProductVisibleForStore,
  isCouponValidForStore,
} = require('../stores/store.service');
const { getSettings } = require('../settings/settings.service');
const { notifyOrderConfirmed, notifyOrderStatus, notifyAdmins } = require('../../services/notification.service');
const { buildInvoicePdf } = require('../invoices/invoice-pdf.service');
const { isValidPhone } = require('../../utils/phone.utils');
const { getShippingCost, computeOrderTotal } = require('../../utils/shipping.utils');

// ✅ URL du frontend — utilise la variable réellement configurée sur Render.
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

function sanitizeAttribution(attribution) {
  if (!attribution || typeof attribution !== 'object' || Array.isArray(attribution)) return null;
  const allowedKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'fbp', 'fbc', 'landing_page', 'captured_at'];
  const sanitized = Object.fromEntries(
    allowedKeys
      .filter((key) => typeof attribution[key] === 'string' && attribution[key].length <= 1000)
      .map((key) => [key, attribution[key]]),
  );
  return Object.keys(sanitized).length ? sanitized : null;
}

// ─── Destinations locales (paiement à la livraison autorisé) ─────────────────
const LOCAL_DESTINATIONS = ['SENEGAL'];

// ─── Validation cohérence paiement / destination ──────────────────────────────
function validatePaymentDestination(paymentMethod, destination) {
  const isLocal = !destination || LOCAL_DESTINATIONS.includes(destination);
  if (!isLocal && paymentMethod === 'CASH_ON_DELIVERY') {
    const error = new Error(
      'Le paiement à la livraison n\'est pas disponible pour les commandes internationales. ' +
      'Veuillez choisir Mobile Money.'
    );
    error.status = 400;
    throw error;
  }
}

// ─── Validation adresse de livraison complète ─────────────────────────────────
function validateShippingAddress(shippingAddress) {
  const required = ['fullName', 'phone', 'street', 'city'];
  const missing = required.filter(
    (field) => !shippingAddress?.[field] || String(shippingAddress[field]).trim() === ''
  );
  if (missing.length > 0) {
    const error = new Error(
      `Adresse de livraison incomplète. Champs manquants : ${missing.join(', ')}.`
    );
    error.status = 400;
    throw error;
  }
}

// ─── Utilitaire email async ────────────────────────────────────────────────────
function sendEmailAsync(mailOptions, orderId = null) {
  const { from, ...brevoOptions } = mailOptions;
  sendEmail(brevoOptions)
    .then(async () => {
      console.log('✅ Email envoyé à :', brevoOptions.to);
      if (orderId) {
        await prisma.order.update({
          where: { id: orderId },
          data: { confirmationEmailStatus: 'SENT' },
        }).catch(() => {});
      }
    })
    .catch(async (err) => {
      console.error('❌ ERREUR EMAIL :', err.message, err.response?.data || '');
      if (orderId) {
        await prisma.order.update({
          where: { id: orderId },
          data: {
            confirmationEmailStatus: 'FAILED',
            confirmationEmailError: err.message.slice(0, 500),
          },
        }).catch(() => {});
      }
      // ✅ Alerte les admins pour qu'ils puissent recontacter le client manuellement
      notifyAdmins({
        type: 'ORDER_CANCELLED', // ou ajoute un type dédié EMAIL_FAILED dans l'enum
        title: '⚠️ Échec envoi email de confirmation',
        message: `Impossible d'envoyer l'email de confirmation pour la commande ${orderId}.`,
        link: '/admin/orders',
      }).catch(() => {});
    });
}

// ─── Génère un numéro de commande garanti unique ──────────────────────────────
async function generateUniqueOrderNumber() {
  const MAX_ATTEMPTS = 5;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const candidate = generateOrderNumber();
    const exists = await prisma.order.findUnique({
      where: { orderNumber: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }
  const error = new Error('Impossible de générer un numéro de commande unique. Réessayez.');
  error.status = 500;
  throw error;
}

async function createOrder(payload, user, ip = null) {
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    const error = new Error('La commande doit contenir au moins un produit.');
    error.status = 400;
    throw error;
  }

  // ✅ Valide chaque article AVANT tout calcul de stock/prix — bloque les quantités
  // négatives, nulles ou non entières qui fausseraient checkStock/reserveStockItems.
  for (const item of payload.items) {
    if (!item.productId || !Number.isInteger(item.quantity) || item.quantity < 1) {
      const error = new Error('Chaque article doit avoir un produit et une quantité entière positive.');
      error.status = 400;
      throw error;
    }
  }

  validatePaymentDestination(payload.paymentMethod, payload.destination);
  validateShippingAddress(payload.shippingAddress);

  const phone = user?.phone || payload.guestPhone;
  if (!isValidPhone(phone)) {
    const error = new Error('Numéro de téléphone invalide ou manquant.');
    error.status = 400;
    throw error;
  }

  const store = await resolveStoreForOrder(payload.storeId);

  const productIds = [...new Set(payload.items.map((item) => item.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, isActive: true },
    // ✅ price ajouté au select — c'est la source de vérité, jamais payload.items[].price
    // ✅ supplier ajouté pour transmettre ses infos dans le mail admin
    select: {
      id: true,
      name: true,
      storeId: true,
      price: true,
      supplier: { select: { id: true, name: true, phone: true } },
    },
  });
  if (products.length !== productIds.length) {
    const error = new Error('Un ou plusieurs produits sont introuvables ou inactifs.');
    error.status = 400;
    throw error;
  }
  const productMap = new Map(products.map((p) => [p.id, p]));

  for (const product of products) {
    if (!isProductVisibleForStore(product.storeId, store.id)) {
      const error = new Error(`Le produit « ${product.name} » n'est pas disponible sur cette boutique.`);
      error.status = 400;
      throw error;
    }
  }

  // ✅ Récupère les variantes pour valider leur appartenance au bon produit
  // et construire un libellé fiable (taille/couleur), sans faire confiance au payload.
  const variantIds = [...new Set(payload.items.map((item) => item.variantId).filter(Boolean))];
  const variants = variantIds.length
    ? await prisma.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: { id: true, productId: true, size: true, color: true },
      })
    : [];
  const variantMap = new Map(variants.map((v) => [v.id, v]));

  // ✅ Reconstruit chaque article de commande à partir des données serveur.
  // payload.items ne sert plus qu'à connaître productId/variantId/quantity —
  // price, productName et variantLabel viennent tous de la base de données.
  const trustedItems = payload.items.map((item) => {
    const product = productMap.get(item.productId);
    if (!product) {
      const error = new Error('Produit introuvable.');
      error.status = 400;
      throw error;
    }

    let variantLabel = null;
    if (item.variantId) {
      const variant = variantMap.get(item.variantId);
      if (!variant || variant.productId !== item.productId) {
        const error = new Error('Variante invalide pour ce produit.');
        error.status = 400;
        throw error;
      }
      variantLabel = `${variant.size} — ${variant.color}`;
    }

    return {
      productId: item.productId,
      variantId: item.variantId || null,
      productName: product.name,
      variantLabel,
      price: product.price,
      quantity: item.quantity,
      supplier: product.supplier || null,
    };
  });

  // ✅ Garde-fou : rejette proprement une commande si un article n'a pas de prix
  // exploitable, plutôt que de laisser un NaN se propager jusqu'au paiement.
  for (const item of trustedItems) {
    if (!Number.isFinite(item.price) || item.price <= 0) {
      const error = new Error(`Le produit « ${item.productName} » n'a pas de prix valide.`);
      error.status = 400;
      throw error;
    }
  }

  const stockErrors = await checkStock(trustedItems);
  if (stockErrors.length > 0) {
    const error = new Error(stockErrors[0]);
    error.status = 400;
    throw error;
  }

  const orderNumber = await generateUniqueOrderNumber();
  const userId = user?.id || null;
  const guestEmail = user?.email || payload.guestEmail || null;
  const guestName = payload.guestName || payload.shippingAddress?.fullName || 'Cliente';
  const subtotal = trustedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = trustedItems.reduce((sum, item) => sum + item.quantity, 0);
  const settings = await getSettings(store.id);
  const shippingCost = getShippingCost(payload.destination, settings, { itemCount, subtotal });
  const storeDiscount = computeStoreDiscount(subtotal, store.discountRate);

  let discount = 0;
  let couponId = null;

  if (payload.couponId) {
    const coupon = await prisma.coupon.findUnique({ where: { id: payload.couponId } });
    if (!coupon || !coupon.isActive) {
      const error = new Error('Code promo invalide ou expiré.');
      error.status = 400;
      throw error;
    }
    if (!isCouponValidForStore(coupon.storeId, store.id)) {
      const error = new Error('Ce code promo n\'est pas valable pour cette boutique.');
      error.status = 400;
      throw error;
    }
    discount = coupon.type === 'PERCENTAGE'
      ? Math.floor(subtotal * coupon.value / 100)
      : coupon.value;
    couponId = coupon.id;
  }

  const total = computeOrderTotal(subtotal, shippingCost, discount, storeDiscount);
  const isDraft = payload.status === 'DRAFT';
  const initialStatus = isDraft ? 'DRAFT' : 'PENDING';

  const expiryHours = Number(settings.reservation_expiry_hours || 24);
  const reservationExpiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

  const order = await prisma.$transaction(async (tx) => {
    await reserveStockItems(tx, trustedItems);

    if (couponId) {
      await tx.coupon.update({
        where: { id: couponId },
        data: { usedCount: { increment: 1 } },
      });
    }

    const created = await tx.order.create({
      data: {
        orderNumber,
        // ✅ Relation explicite requise par Prisma (Checked Input) car cette
        // écriture mélange des scalaires de FK avec des créations imbriquées
        // (items, tracking, statusHistory, payments). Sans "connect", Prisma
        // lève "Argument `store` is missing." même si storeId est fourni.
        store: { connect: { id: store.id } },
        // ✅ Relations optionnelles : on ne les inclut que si une valeur existe,
        // sinon Prisma refuserait un connect avec un id null/undefined.
        ...(userId ? { user: { connect: { id: userId } } } : {}),
        guestEmail,
        guestPhone: payload.guestPhone,
        guestName,
        status: initialStatus,
        paymentMethod: payload.paymentMethod,
        subtotal,
        shippingCost,
        discount,
        storeDiscount,
        ...(couponId ? { coupon: { connect: { id: couponId } } } : {}),
        total,
        shippingAddress: payload.shippingAddress,
        destination: payload.destination || null,
        notes: payload.notes,
        attribution: sanitizeAttribution(payload.attribution),
        metaPurchaseEventId: `purchase_${orderNumber}`,
        reservationExpiresAt,
        items: {
          create: trustedItems.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            productName: item.productName,
            variantLabel: item.variantLabel,
            price: item.price,
            quantity: item.quantity,
            subtotal: item.price * item.quantity,
          })),
        },
        tracking: {
          create: {
            status: initialStatus,
            message: isDraft
              ? 'Commande WhatsApp en attente de confirmation.'
              : 'Commande enregistrée et en attente de confirmation.',
            location: payload.shippingAddress?.city || null,
          },
        },
        statusHistory: {
          create: {
            toStatus: initialStatus,
            message: isDraft ? 'Commande WhatsApp créée (brouillon)' : 'Commande créée',
            changedBy: userId,
          },
        },
        payments: {
          create: {
            method: payload.paymentMethod,
            status: 'PENDING',
            amount: total,
          },
        },
      },
      include: { items: true, tracking: true, payments: true, store: true },
    });

    await logAudit({
      tx,
      userId,
      storeId: store.id,
      action: 'ORDER_CREATE',
      module: 'orders',
      entityId: created.id,
      entityType: 'Order',
      newValue: { orderNumber, total, storeId: store.id, destination: payload.destination },
      ip,
    });

    return created;
  }, {
    timeout: 20000,
    maxWait: 10000,
  });

  if (!isDraft && guestEmail) {
    const emailData = buildOrderConfirmationEmail({
      orderNumber,
      guestName,
      total,
      subtotal,
      shippingCost,
      discount,
      storeDiscount,
      destination: payload.destination,
      items: trustedItems,
      paymentMethod: payload.paymentMethod,
      shippingAddress: payload.shippingAddress,
      clientUrl: FRONTEND_URL,
      isGuest: !userId,
      storeName: store.name,
      storeCode: store.code,
    });
    sendEmailAsync({ to: guestEmail, subject: emailData.subject, html: emailData.html });
  }

  // ── Mail admin dédié, avec infos fournisseur ────────────────────────────────
  if (!isDraft && process.env.ADMIN_EMAIL) {
    const adminEmailData = buildAdminNewOrderEmail({
      orderNumber,
      guestName,
      total,
      items: trustedItems,
      shippingAddress: payload.shippingAddress,
      paymentMethod: payload.paymentMethod,
      adminUrl: `${FRONTEND_URL}/admin/orders`,
      storeName: store.name,
      storeCode: store.code,
    });
    sendEmailAsync({
      to: process.env.ADMIN_EMAIL,
      subject: adminEmailData.subject,
      html: adminEmailData.html,
    });
  }

  if (!isDraft && userId) {
    const orderWithUserId = { ...order, userId, orderNumber };
    notifyOrderConfirmed(orderWithUserId).catch((err) =>
      console.error('❌ Erreur notif OneSignal createOrder:', err.message)
    );
  }

  if (!isDraft) {
    notifyAdmins({
      type:    'NEW_ORDER',
      title:   `🛍️ Nouvelle commande — ${store.name}`,
      message: `Commande ${orderNumber} reçue — à traiter.`,
      link:    '/admin/orders',
      storeId: store.id,
    }).catch(err => console.error('❌ Erreur notif admin nouvelle commande:', err.message));
  }

  return order;
}

async function getUserOrders(userId) {
  return prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      items: true,
      tracking: { orderBy: { createdAt: 'asc' } },
      invoice: true,
    },
  });
}

async function getOrderByNumber(orderNumber) {
  return prisma.order.findUnique({
    where: { orderNumber },
    include: {
      items: true,
      tracking: { orderBy: { createdAt: 'asc' } },
      invoice: true,
      statusHistory: { orderBy: { createdAt: 'desc' } },
      user: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
      store: { select: { id: true, code: true, name: true } },
    },
  });
}

async function changeOrderStatus(orderId, payload, adminUser, ip) {
  const order = await changeOrderStatusAtomic(orderId, payload, adminUser, ip);

  const customerEmail = order.user?.email || order.guestEmail;
  const customerName = order.user
    ? `${order.user.firstName} ${order.user.lastName}`
    : order.guestName;

  // ── Email statut ───────────────────────────────────────────────────────────
  if (customerEmail) {
    const emailData = buildOrderStatusEmail({
      orderNumber: order.orderNumber,
      customerName,
      status: order.status,
      clientUrl: FRONTEND_URL,
      isGuest: !order.userId,
      storeName: order.store?.name || 'SonShop',
      storeCode: order.store?.code || 'SONSHOP',
    });

    let attachments = [];
    if (order.invoice && order.status === 'DELIVERED') {
      try {
        const pdfBuffer = await buildInvoicePdf(order.invoice);
        attachments = [{
          filename: `facture-${order.invoice.invoiceNumber}.pdf`,
          content: pdfBuffer.toString('base64'),
        }];
      } catch (err) {
        console.error('❌ Erreur génération PDF facture :', err.message);
      }
    }

    sendEmailAsync({
      to: customerEmail,
      subject: emailData.subject,
      html: emailData.html,
      attachments,
    });
  }

  // ── Push OneSignal statut client ───────────────────────────────────────────
  if (order.userId) {
    notifyOrderStatus(order, order.status).catch((err) =>
      console.error('❌ Erreur notif OneSignal changeStatus:', err.message)
    );
  }

  return order;
}

function buildOrdersWhere(query, storeIds = null) {
  const where = {};

  if (query.status) where.status = query.status;
  if (query.paymentStatus) where.paymentStatus = query.paymentStatus;
  if (query.paymentMethod) where.paymentMethod = query.paymentMethod;
  if (query.destination) where.destination = query.destination;

  if (query.storeId) {
    if (storeIds?.length && !storeIds.includes(query.storeId)) {
      const error = new Error('Accès refusé à cette boutique.');
      error.status = 403;
      throw error;
    }
    where.storeId = query.storeId;
  } else if (Array.isArray(storeIds)) {
    if (storeIds.length === 0) {
      where.storeId = { in: [] };
    } else {
      where.storeId = { in: storeIds };
    }
  }

  applyDateRangeFilter(where, 'createdAt', query);

  if (query.search) {
    const s = String(query.search).trim();
    where.OR = [
      { orderNumber: { contains: s } },
      { guestName: { contains: s } },
      { guestEmail: { contains: s } },
      { guestPhone: { contains: s } },
      { user: { email: { contains: s } } },
      { user: { firstName: { contains: s } } },
      { user: { lastName: { contains: s } } },
    ];
  }

  return where;
}

async function getAllOrders(query, storeIds = null) {
  const { page, limit, skip } = parsePagination(query);
  const where = buildOrdersWhere(query, storeIds);

  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
        tracking: { orderBy: { createdAt: 'asc' } },
        user: true,
        invoice: true,
        store: { select: { id: true, code: true, name: true } },
        statusHistory: { orderBy: { createdAt: 'desc' }, take: 3 },
      },
    }),
  ]);
  return buildPaginationResponse({ data: orders, total, page, limit });
}

module.exports = {
  createOrder,
  getUserOrders,
  getOrderByNumber,
  changeOrderStatus,
  getAllOrders,
  buildOrdersWhere,
};