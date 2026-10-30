const prisma = require('../../config/database');
const { sendPurchaseEventSafely } = require('../../services/meta-conversions.service');

const {
  initierPaiement,
  verifierStatut,
} = require('./cinetpay.service');

async function markPaymentAsPaid(paymentId, orderId) {
  await prisma.$transaction([
    prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'PAID', paidAt: new Date() },
    }),
    prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: 'PAID', status: 'CONFIRMED' },
    }),
  ]);

  // Le suivi marketing ne doit jamais empêcher la confirmation d'un paiement.
  await sendPurchaseEventSafely(orderId);
}

async function creerPaiementPourCommande(orderId) {
  const order = await prisma.order.findUnique({
    where: {
      id: orderId,
    },
    include: {
      user: true,
    },
  });

  if (!order) {
    const err = new Error('Commande introuvable');
    err.statusCode = 404;
    throw err;
  }

  const merchantTransactionId =
    `CMD${order.id}${Date.now()}`.slice(0, 30);

  const customer = {
    firstName:
      order.user?.firstName ||
      order.guestName?.split(' ')[0] ||
      'Client',

    lastName:
      order.user?.lastName ||
      order.guestName?.split(' ').slice(1).join(' ') ||
      'Boutique',

    email:
      order.user?.email ||
      order.guestEmail,

    phone:
      order.user?.phone ||
      order.guestPhone,
  };

  if (!customer.email) {
    const err = new Error(
      'Email client manquant pour le paiement CinetPay'
    );
    err.statusCode = 400;
    throw err;
  }

  if (!customer.phone) {
    const err = new Error(
      'Téléphone client manquant pour le paiement CinetPay'
    );
    err.statusCode = 400;
    throw err;
  }

  const frontendUrl = process.env.FRONTEND_URL;
  const apiBaseUrl = process.env.API_BASE_URL;

  if (!frontendUrl) {
    const err = new Error(
      'FRONTEND_URL non configurée'
    );
    err.statusCode = 500;
    throw err;
  }

  if (!apiBaseUrl) {
    const err = new Error(
      'API_BASE_URL non configurée'
    );
    err.statusCode = 500;
    throw err;
  }

  /*
   * URL de retour vers la commande.
   *
   * CinetPay redirige le navigateur ici après le paiement.
   *
   * Le frontend ne considère PAS cette redirection comme une preuve
   * de paiement. Il appelle ensuite l'API de vérification.
   */
  const returnUrl =
    `${frontendUrl}/orders/${order.orderNumber}?payment=return`;

  const result = await initierPaiement({
    merchantTransactionId,

    amount: order.total,

    designation:
      `Commande ${order.orderNumber}`,

    customer,

    notifyUrl:
      `${apiBaseUrl}/api/payments/cinetpay/notify`,

    successUrl: returnUrl,

    failedUrl: returnUrl,
  });

  if (!result || result.code !== 200) {
    const err = new Error(
      result?.description ||
      'Erreur lors de l’initialisation CinetPay'
    );

    err.statusCode = 422;
    err.cinetpayResponse = result;

    throw err;
  }

  if (!result.payment_url) {
    const err = new Error(
      'CinetPay n’a pas retourné de payment_url'
    );

    err.statusCode = 422;
    err.cinetpayResponse = result;

    throw err;
  }

  /*
   * orders.service.js crée déjà normalement un Payment PENDING
   * lors de la création de la commande.
   *
   * On le met donc à jour plutôt que de créer un doublon.
   */
  const existingPayment = await prisma.payment.findFirst({
    where: {
      orderId: order.id,
      status: 'PENDING',
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (existingPayment) {
    await prisma.payment.update({
      where: {
        id: existingPayment.id,
      },
      data: {
        transactionId: merchantTransactionId,
        notifyToken: result.notify_token,
      },
    });
  } else {
    await prisma.payment.create({
      data: {
        orderId: order.id,
        method: 'MOBILE_MONEY',
        amount: order.total,
        transactionId: merchantTransactionId,
        notifyToken: result.notify_token,
      },
    });
  }

  console.log(
    `✅ Paiement CinetPay initialisé pour ${order.orderNumber}`
  );

  console.log(
    '🔗 URL de paiement:',
    result.payment_url
  );

  return {
    paymentUrl: result.payment_url,
    merchantTransactionId,
    transactionId: result.transaction_id,
  };
}

/**
 * Traitement du webhook CinetPay.
 *
 * IMPORTANT :
 * Le webhook ne fait pas confiance au statut envoyé directement.
 * On appelle verifierStatut() auprès de CinetPay.
 */
async function traiterNotification({
  notify_token,
  merchant_transaction_id,
}) {
  if (!merchant_transaction_id) {
    const err = new Error(
      'merchant_transaction_id manquant'
    );
    err.statusCode = 400;
    throw err;
  }

  const payment = await prisma.payment.findFirst({
    where: {
      transactionId: merchant_transaction_id,
    },
  });

  if (!payment) {
    const err = new Error(
      'Paiement introuvable'
    );
    err.statusCode = 404;
    throw err;
  }

  if (
    payment.notifyToken &&
    payment.notifyToken !== notify_token
  ) {
    const err = new Error(
      'notify_token invalide'
    );
    err.statusCode = 403;
    throw err;
  }

  // Idempotence
  if (
    payment.status === 'PAID' ||
    payment.status === 'REJECTED'
  ) {
    return {
      alreadyProcessed: true,
      status: payment.status,
    };
  }

  // Vérification directe auprès de CinetPay
  const verif =
    await verifierStatut(
      merchant_transaction_id
    );

  const statutReel = String(
    verif.details?.status ||
    verif.status ||
    ''
  ).toUpperCase();

  console.log(
    `🔎 Statut réel CinetPay ${merchant_transaction_id}:`,
    statutReel
  );

  if (
    statutReel === 'SUCCESS' ||
    statutReel === 'ACCEPTED' ||
    statutReel === 'PAID'
  ) {
    await markPaymentAsPaid(payment.id, payment.orderId);

    return {
      status: 'PAID',
    };
  }

  if (
    statutReel === 'FAILED' ||
    statutReel === 'REJECTED' ||
    statutReel === 'CANCELLED'
  ) {
    await prisma.payment.update({
      where: {
        id: payment.id,
      },
      data: {
        status: 'REJECTED',
      },
    });

    /*
     * On ne force PAS la commande à CONFIRMED ici.
     *
     * Elle reste dans son état actuel, mais son paiement est rejeté.
     */
    await prisma.order.update({
      where: {
        id: payment.orderId,
      },
      data: {
        paymentStatus: 'REJECTED',
      },
    });

    return {
      status: 'REJECTED',
    };
  }

  return {
    status: 'PENDING',
  };
}

/**
 * Vérification active appelée par le frontend
 * lorsque le client revient de CinetPay.
 */
async function verifierPaiementParCommande(orderId) {
  const order = await prisma.order.findUnique({
    where: {
      id: orderId,
    },
  });

  if (!order) {
    const err = new Error(
      'Commande introuvable'
    );
    err.statusCode = 404;
    throw err;
  }

  const payment = await prisma.payment.findFirst({
    where: {
      orderId,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (!payment || !payment.transactionId) {
    const err = new Error(
      'Aucun paiement CinetPay initié pour cette commande'
    );

    err.statusCode = 404;

    throw err;
  }

  // Déjà traité par webhook
  if (payment.status === 'PAID') {
    return {
      status: 'PAID',
    };
  }

  if (payment.status === 'REJECTED') {
    return {
      status: 'REJECTED',
    };
  }

  // Vérification directe auprès de CinetPay
  const verif =
    await verifierStatut(
      payment.transactionId
    );

  const statutReel = String(
    verif.details?.status ||
    verif.status ||
    ''
  ).toUpperCase();

  console.log(
    `🔎 Vérification frontend ${payment.transactionId}:`,
    statutReel
  );

  if (
    statutReel === 'SUCCESS' ||
    statutReel === 'ACCEPTED' ||
    statutReel === 'PAID'
  ) {
    await markPaymentAsPaid(payment.id, orderId);

    return {
      status: 'PAID',
    };
  }

  if (
    statutReel === 'FAILED' ||
    statutReel === 'REJECTED' ||
    statutReel === 'CANCELLED'
  ) {
    await prisma.payment.update({
      where: {
        id: payment.id,
      },
      data: {
        status: 'REJECTED',
      },
    });

    await prisma.order.update({
      where: {
        id: orderId,
      },
      data: {
        paymentStatus: 'REJECTED',
      },
    });

    return {
      status: 'REJECTED',
    };
  }

  return {
    status: 'PENDING',
  };
}

module.exports = {
  creerPaiementPourCommande,
  traiterNotification,
  verifierPaiementParCommande,
};
