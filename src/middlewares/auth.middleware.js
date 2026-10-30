const { verifyToken } = require('../utils/jwt.utils');
const { getAccessibleStoreIds } = require('../modules/stores/store.service');

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token manquant ou invalide' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = verifyToken(token);

    // Sécurité : un token émis pendant le flux 2FA (setup2fa / pending2fa) ne
    // doit jamais pouvoir servir de token de session normal. Ces tokens ne
    // sont valides que sur les routes /api/auth/2fa/* dédiées.
    if (payload.purpose) {
      return res.status(401).json({ message: 'Token invalide pour cette opération' });
    }

    req.user = payload;
    req.storeIds = await getAccessibleStoreIds(payload);
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token invalide' });
  }
}

// ✅ Middleware optionnel : récupère le user si connecté, sinon continue en invité
async function authenticateOptional(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null; // invité
    return next();
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = verifyToken(token);
    if (payload.purpose) {
      req.user = null;
      return next();
    }
    req.user = payload;
    req.storeIds = await getAccessibleStoreIds(payload);
  } catch {
    req.user = null; // token invalide → traité comme invité
  }
  next();
}

function isAdmin(req, res, next) {
  authenticate(req, res, () => {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Accès réservé aux admins' });
    }
    next();
  });
}

function requireAdmin(req, res, next) {
  authenticate(req, res, () => {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Accès réservé aux admins' });
    }
    next();
  });
}

// ─── Middleware dédié aux routes de configuration 2FA (setup2fa) ─────────
// Vérifie un token de type "setup2fa" émis juste après un login réussi par
// mot de passe, pour un compte qui n'a pas encore activé la 2FA.
function requireSetupToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token de configuration manquant' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = verifyToken(token);
    if (payload.purpose !== 'setup2fa') {
      return res.status(403).json({ message: 'Token non autorisé pour cette opération' });
    }
    req.twoFactorPayload = payload;
    next();
  } catch {
    return res.status(401).json({ message: 'Token invalide ou expiré' });
  }
}

// ─── Middleware dédié à la vérification 2FA lors d'une connexion ─────────
// Vérifie un token de type "pending2fa" émis juste après un login réussi par
// mot de passe, pour un compte ayant déjà la 2FA active.
function requirePendingToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token en attente manquant' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = verifyToken(token);
    if (payload.purpose !== 'pending2fa') {
      return res.status(403).json({ message: 'Token non autorisé pour cette opération' });
    }
    req.twoFactorPayload = payload;
    next();
  } catch {
    return res.status(401).json({ message: 'Token invalide ou expiré' });
  }
}

module.exports = {
  authenticate,
  authenticateOptional,
  isAdmin,
  requireAdmin,
  requireSetupToken,
  requirePendingToken,
};