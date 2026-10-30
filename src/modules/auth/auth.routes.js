// backend/src/modules/auth/auth.routes.js
// Remplace ENTIÈREMENT le fichier existant

const express = require('express');
const { body } = require('express-validator');
const { authController } = require('./auth.controller');
const twoFactorController = require('./twoFactor.controller');
const { checkValidation } = require('../../middlewares/validation.middleware');
const { authLimiter } = require('../../middlewares/rateLimit.middleware');
const {
  authenticate,
  requireSetupToken,
  requirePendingToken,
} = require('../../middlewares/auth.middleware');
const prisma = require('../../config/database');
const { getAccessibleStoreIds } = require('../stores/store.service');
const { signToken } = require('../../utils/jwt.utils');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────
// INSCRIPTION EN 3 ÉTAPES (avec OTP)
// ─────────────────────────────────────────────────────────────────────────

router.post(
  '/register/request-otp',
  authLimiter,
  body('email').isEmail().withMessage('Email invalide'),
  checkValidation,
  authController.requestOtp
);

router.post(
  '/register/verify-otp',
  authLimiter,
  body('email').isEmail().withMessage('Email invalide'),
  body('code').isLength({ min: 6, max: 6 }).withMessage('Code à 6 chiffres requis'),
  checkValidation,
  authController.verifyOtp
);

router.post(
  '/register/complete',
  authLimiter,
  body('firstName').notEmpty().withMessage('Prénom requis'),
  body('lastName').notEmpty().withMessage('Nom requis'),
  body('password').isLength({ min: 6 }).withMessage('Mot de passe minimum 6 caractères'),
  checkValidation,
  authController.completeRegistration
);

// ─────────────────────────────────────────────────────────────────────────
// ROUTES EXISTANTES (inchangées)
// ─────────────────────────────────────────────────────────────────────────

router.post(
  '/register',
  authLimiter,
  body('email').isEmail(),
  body('password').isLength({ min: 6 }),
  body('firstName').notEmpty(),
  body('lastName').notEmpty(),
  checkValidation,
  authController.register
);

router.post(
  '/login',
  authLimiter,
  body('email').isEmail(),
  body('password').notEmpty(),
  checkValidation,
  authController.login
);

/**
 * @swagger
 * /api/auth/google:
 *   post:
 *     summary: Se connecter ou s'inscrire via Google
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             credential: "eyJhbGciOi..."
 *     responses:
 *       200:
 *         description: Connexion réussie, retourne token + user
 *       401:
 *         description: Token Google invalide
 */
router.post(
  '/google',
  authLimiter,
  body('credential').notEmpty().withMessage('Token Google requis'),
  checkValidation,
  authController.googleAuth
);

router.post('/logout', authenticate, authController.logout);

router.get('/me', authenticate, authController.me);

router.post('/switch-store', authenticate, async (req, res, next) => {
  try {
    const { storeId } = req.body;
    if (!storeId) {
      return res.status(400).json({ message: 'storeId requis' });
    }

    if (req.user.role !== 'ADMIN') {
      const allowed = await getAccessibleStoreIds(req.user);
      if (!allowed.includes(storeId)) {
        return res.status(403).json({ message: 'Accès refusé à cette boutique' });
      }
    }

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store || !store.isActive) {
      return res.status(404).json({ message: 'Boutique introuvable ou inactive' });
    }

    const token = signToken({
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      activeStoreId: storeId,
    });

    res.json({ token, store });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// DOUBLE AUTHENTIFICATION (2FA) — ADMIN, STAFF, SELLER
// ─────────────────────────────────────────────────────────────────────────

// Première configuration : génère le QR code (nécessite le setupToken renvoyé par /login)
router.post(
  '/2fa/setup',
  authLimiter,
  requireSetupToken,
  twoFactorController.setupTwoFactor
);

// Confirme la configuration avec le premier code de l'app authenticator
router.post(
  '/2fa/enable',
  authLimiter,
  requireSetupToken,
  body('code').isLength({ min: 6, max: 6 }).withMessage('Code à 6 chiffres requis'),
  checkValidation,
  twoFactorController.enableTwoFactor
);

// Vérifie le code lors d'une connexion (2FA déjà active, nécessite le pendingToken)
router.post(
  '/2fa/verify',
  authLimiter,
  requirePendingToken,
  twoFactorController.verifyTwoFactorLogin
);

// Désactive la 2FA (session déjà authentifiée + mot de passe + code actuel)
router.post(
  '/2fa/disable',
  authenticate,
  body('password').notEmpty().withMessage('Mot de passe requis'),
  body('code').isLength({ min: 6, max: 6 }).withMessage('Code à 6 chiffres requis'),
  checkValidation,
  twoFactorController.disableTwoFactor
);
// Changement d'appareil : étape 1 — réauthentification + nouveau QR code
router.post(
  '/2fa/reconfigure/start',
  authenticate,
  authLimiter,
  body('password').notEmpty().withMessage('Mot de passe requis'),
  checkValidation,
  twoFactorController.startTwoFactorReconfigure
);

// Changement d'appareil : étape 2 — confirmation avec le nouveau code
router.post(
  '/2fa/reconfigure/confirm',
  authenticate,
  authLimiter,
  body('code').isLength({ min: 6, max: 6 }).withMessage('Code à 6 chiffres requis'),
  checkValidation,
  twoFactorController.confirmTwoFactorReconfigure
);
module.exports = router;