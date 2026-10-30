const {
  creerPaiementPourCommande,
  traiterNotification,
  verifierPaiementParCommande,
} = require('./payments.service');

/**
 * POST /api/payments/cinetpay/initier
 *
 * Initialise un paiement CinetPay pour une commande.
 */
async function initier(req, res, next) {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      const err = new Error('orderId est requis');
      err.statusCode = 400;
      throw err;
    }

    console.log('💳 Initialisation paiement CinetPay pour commande :', orderId);

    const result = await creerPaiementPourCommande(orderId);

    console.log('✅ Paiement CinetPay initialisé');

    if (result?.paymentUrl) {
      console.log('🔗 URL de paiement :', result.paymentUrl);
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error(
      '❌ Erreur CinetPay détaillée:',
      err.response?.data || err.message
    );

    return next(err);
  }
}

/**
 * POST /api/payments/cinetpay/notify
 *
 * Webhook appelé par CinetPay pour notifier le changement
 * de statut d'une transaction.
 */
async function notifier(req, res) {
  try {
    console.log('📩 Webhook CinetPay reçu');

    console.log(
      '📦 Données webhook:',
      JSON.stringify(req.body, null, 2)
    );

    await traiterNotification(req.body);

    console.log('✅ Webhook CinetPay traité avec succès');

    return res.sendStatus(200);
  } catch (err) {
    console.error(
      '❌ Erreur webhook CinetPay:',
      err.response?.data || err.message
    );

    /*
     * On renvoie le code approprié lorsque notre service
     * détecte une erreur connue.
     *
     * CinetPay doit pouvoir appeler notre endpoint sans
     * recevoir une erreur interne inutile.
     */
    return res.sendStatus(err.statusCode || 500);
  }
}

/**
 * GET /api/payments/cinetpay/notify
 *
 * Certains systèmes de monitoring ou CinetPay peuvent
 * effectuer une requête GET pour vérifier que l'URL existe.
 */
function notifierHealthCheck(req, res) {
  return res.sendStatus(200);
}

/**
 * GET /api/payments/cinetpay/verifier/:orderId
 *
 * Vérification active du statut du paiement.
 *
 * Cette route est appelée par le frontend lorsque le client
 * revient de CinetPay.
 */
async function verifier(req, res, next) {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      const err = new Error('orderId est requis');
      err.statusCode = 400;
      throw err;
    }

    console.log(
      '🔎 Vérification paiement CinetPay pour commande :',
      orderId
    );

    const result = await verifierPaiementParCommande(orderId);

    console.log(
      `🔎 Statut paiement commande ${orderId}:`,
      result?.status
    );

    return res.status(200).json(result);
  } catch (err) {
    console.error(
      '❌ Erreur vérification CinetPay:',
      err.response?.data || err.message
    );

    return next(err);
  }
}

module.exports = {
  initier,
  notifier,
  notifierHealthCheck,
  verifier,
};