const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Trop de requêtes, réessayez plus tard.',
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: "Trop de requêtes sur l'API, réessayez dans une minute.",
});

// Chaque commande réserve du stock — protection plus stricte que l'API
// générale, pour éviter qu'un script ne bloque l'inventaire avec de
// fausses réservations.
// Note: en Afrique de l'Ouest, plusieurs clients peuvent partager une
// même IP (NAT opérateur mobile) — ajuste "max" si tu vois des faux
// positifs côté clients légitimes.
const orderCreationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Trop de commandes créées récemment depuis cette adresse. Réessayez dans quelques minutes, ou écrivez-nous directement sur WhatsApp.",
});

module.exports = { authLimiter, apiLimiter, orderCreationLimiter };