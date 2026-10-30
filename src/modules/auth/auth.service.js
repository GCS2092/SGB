// backend/src/modules/auth/auth.service.js
// Remplace ENTIÈREMENT le fichier existant

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const prisma = require('../../config/database');
const { signToken } = require('../../utils/jwt.utils');
const { getAccessibleStoreIds } = require('../stores/store.service');
const { sendEmail } = require('../../config/email');
const { buildOtpEmail } = require('../../utils/email.utils');

// ─── Durée de validité de l'OTP : 15 minutes ─────────────────────────────
const OTP_TTL_MINUTES = 15;

// ─── Rôles pour lesquels la double authentification est obligatoire ─────
const REQUIRES_2FA_ROLES = ['ADMIN', 'STAFF', 'SELLER'];

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ─── Génère un code numérique à 6 chiffres ───────────────────────────────
function generateOtpCode() {
  return String(Math.floor(100000 + crypto.randomInt(900000)));
}

// ─── ÉTAPE 1 : Demande d'inscription → envoi OTP ─────────────────────────
async function requestRegisterOtp({ email }) {
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const error = new Error('Cet email est déjà utilisé.');
    error.status = 400;
    throw error;
  }

  await prisma.otpCode.deleteMany({
    where: { email, type: 'REGISTER' },
  });

  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await prisma.otpCode.create({
    data: { email, code, type: 'REGISTER', expiresAt },
  });

  const { subject, html } = buildOtpEmail({
    code,
    type: 'REGISTER',
    expiresInMinutes: OTP_TTL_MINUTES,
  });

  await sendEmail({ to: email, subject, html });

  return { message: 'Code de vérification envoyé par email.' };
}

// ─── ÉTAPE 2 : Vérification du code OTP ──────────────────────────────────
async function verifyOtp({ email, code, type = 'REGISTER' }) {
  const otp = await prisma.otpCode.findFirst({
    where: {
      email,
      code,
      type,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!otp) {
    const error = new Error('Code invalide ou expiré.');
    error.status = 400;
    throw error;
  }

  await prisma.otpCode.update({
    where: { id: otp.id },
    data: { usedAt: new Date() },
  });

  const setupToken = signToken(
    { email, otpVerified: true, type },
    { expiresIn: '30m' }
  );

  return { setupToken, message: 'Code vérifié avec succès.' };
}

// ─── ÉTAPE 3 : Création du compte avec mot de passe ──────────────────────
async function completeRegistration({ email, password, firstName, lastName, phone, otpVerified }) {
  if (!otpVerified) {
    const error = new Error('Vérification OTP requise.');
    error.status = 403;
    throw error;
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const error = new Error('Cet email est déjà utilisé.');
    error.status = 400;
    throw error;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      firstName,
      lastName,
      phone,
    },
  });

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
  };
}

// ─── ANCIEN register (conservé pour rétrocompatibilité si besoin) ────────
async function register({ email, password, firstName, lastName, phone }) {
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const error = new Error('Cet email est déjà utilisé.');
    error.status = 400;
    throw error;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, password: hashedPassword, firstName, lastName, phone },
  });

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
  };
}

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

  await prisma.order.updateMany({
    where: { guestEmail: email, userId: null },
    data: { userId: user.id },
  });

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
async function loginWithGoogle({ idToken }) {
  if (!idToken) {
    const error = new Error('Token Google manquant.');
    error.status = 400;
    throw error;
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    const error = new Error('Token Google invalide.');
    error.status = 401;
    throw error;
  }

  const { email, email_verified, given_name, family_name, sub: googleId } = payload;

  if (!email || !email_verified) {
    const error = new Error("Compte Google non vérifié, connexion refusée.");
    error.status = 400;
    throw error;
  }

  let user = await prisma.user.findUnique({ where: { email } });

  if (user) {
    // Sécurité : on ne relie jamais automatiquement un compte ADMIN/STAFF/SELLER à Google.
    // Ces rôles doivent continuer à se connecter par mot de passe (+ 2FA) pour éviter
    // qu'un compte Google externe correspondant au même email ne prenne le contrôle.
    if (user.role !== 'CUSTOMER') {
      const error = new Error("Ce compte doit se connecter avec son mot de passe.");
      error.status = 403;
      throw error;
    }
    if (!user.googleId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId },
      });
    }
  } else {
    user = await prisma.user.create({
      data: {
        email,
        googleId,
        firstName: given_name || 'Client',
        lastName: family_name || '',
        password: null,
      },
    });
  }

  await prisma.order.updateMany({
    where: { guestEmail: email, userId: null },
    data: { userId: user.id },
  });

  // Google login est réservé aux CUSTOMER (voir vérification ci-dessus),
  // donc jamais concerné par la 2FA — pas de vérification nécessaire ici.
  return buildAuthResponse(user);
}

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
  register,
  login,
  loginWithGoogle,
  requestRegisterOtp,
  verifyOtp,
  completeRegistration,
  completeTwoFactorLogin,
  REQUIRES_2FA_ROLES,
};