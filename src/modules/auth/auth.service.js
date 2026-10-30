// backend/src/modules/auth/auth.service.js
// Remplace ENTIÈREMENT le fichier existant

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../../config/database');
const { signToken } = require('../../utils/jwt.utils');
const { getAccessibleStoreIds } = require('../stores/store.service');
const { sendEmail } = require('../../config/email');
const { buildOtpEmail } = require('../../utils/email.utils');

// ─── Durée de validité de l'OTP : 15 minutes ─────────────────────────────
const OTP_TTL_MINUTES = 15;

// ─── Rôles pour lesquels la double authentification est obligatoire ─────
const REQUIRES_2FA_ROLES = ['ADMIN', 'STAFF', 'SELLER'];


// ─── Génère un code numérique à 6 chiffres ───────────────────────────────
// ─── ÉTAPE 1 : Demande d'inscription → envoi OTP ─────────────────────────
// ─── ÉTAPE 2 : Vérification du code OTP ──────────────────────────────────
// ─── ÉTAPE 3 : Création du compte avec mot de passe ──────────────────────
// ─── ANCIEN register (conservé pour rétrocompatibilité si besoin) ────────
// ─── LOGIN classique ──────────────────────────────────────────────────────
async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.password) {
    const error = new Error('Email ou mot de passe incorrect.');
    error.status = 401;
    throw error;
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    const error = new Error('Email ou mot de passe incorrect.');
    error.status = 401;
    throw error;
  }

  // ─── Vérification 2FA pour les rôles sensibles ─────────────────────────
  if (REQUIRES_2FA_ROLES.includes(user.role)) {
    if (!user.twoFactorEnabled) {
      // Jamais configurée : on force la mise en place avant de délivrer un token de session
      const setupToken = signToken(
        { id: user.id, email: user.email, purpose: 'setup2fa' },
        { expiresIn: '15m' }
      );
      return {
        requiresTwoFactorSetup: true,
        setupToken,
        message: 'Configuration de la double authentification requise.',
      };
    }

    // Déjà configurée : on demande le code avant de délivrer le token final
    const pendingToken = signToken(
      { id: user.id, email: user.email, purpose: 'pending2fa' },
      { expiresIn: '10m' }
    );
    return {
      requiresTwoFactor: true,
      pendingToken,
      message: 'Code de double authentification requis.',
    };
  }

  return buildAuthResponse(user);
}

// ─── Finalise la connexion après vérification réussie du code 2FA ───────
async function completeTwoFactorLogin(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    const error = new Error('Utilisateur introuvable.');
    error.status = 404;
    throw error;
  }
  return buildAuthResponse(user);
}

// ─── LOGIN / INSCRIPTION via Google ──────────────────────────────────────
// ─── Helper commun : génère le JWT + la réponse (login classique et Google) ──
async function buildAuthResponse(user) {
  const storeIds = await getAccessibleStoreIds(user);
  const activeStoreId = user.role === 'ADMIN' ? null : (storeIds[0] || null);

  const token = signToken({
    id: user.id,
    email: user.email,
    role: user.role,
    activeStoreId,
  });

  let stores = [];
  if (storeIds.length) {
    stores = await prisma.store.findMany({
      where: { id: { in: storeIds } },
      orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
    });
  }

  const redirectPath = user.role === 'SELLER' ? '/seller'
                      : user.role === 'ADMIN' || user.role === 'STAFF' ? '/admin'
                      : '/';

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    },
    stores,
    redirectPath,
  };
}

module.exports = {
  login,
  completeTwoFactorLogin,
  REQUIRES_2FA_ROLES,
};