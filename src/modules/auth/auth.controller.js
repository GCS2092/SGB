// backend/src/modules/auth/auth.controller.js
// Remplace ENTIÈREMENT le fichier existant

const authService = require('./auth.service');
const { verifyToken } = require('../../utils/jwt.utils');

// ─── Inscription classique (conservée) ───────────────────────────────────────
async function register(req, res, next) {
  try {
    const user = await authService.register(req.body);
    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────
async function login(req, res, next) {
  try {
    const data = await authService.login(req.body);
    res.json(data);
  } catch (error) {
    next(error);
  }
}

// ─── Login / inscription via Google ──────────────────────────────────────────
async function googleAuth(req, res, next) {
  try {
    const { credential } = req.body;
    const data = await authService.loginWithGoogle({ idToken: credential });
    res.json(data);
  } catch (error) {
    next(error);
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────────
async function logout(req, res) {
  res.json({ message: 'Déconnexion réussie' });
}

// ─── Me ───────────────────────────────────────────────────────────────────────
async function me(req, res) {
  res.json(req.user);
}

// ─── ÉTAPE 1 : Demande d'OTP pour inscription ─────────────────────────────────
async function requestOtp(req, res, next) {
  try {
    const result = await authService.requestRegisterOtp({ email: req.body.email });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// ─── ÉTAPE 2 : Vérification de l'OTP ─────────────────────────────────────────
async function verifyOtp(req, res, next) {
  try {
    const { email, code } = req.body;
    const result = await authService.verifyOtp({ email, code, type: 'REGISTER' });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// ─── ÉTAPE 3 : Finalisation du compte (définition du mot de passe) ────────────
async function completeRegistration(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const setupToken = authHeader.replace('Bearer ', '').trim();

    if (!setupToken) {
      return res.status(401).json({ message: 'Token de configuration manquant.' });
    }

    let payload;
    try {
      payload = verifyToken(setupToken);
    } catch {
      return res.status(401).json({ message: 'Token invalide ou expiré.' });
    }

    if (!payload.otpVerified || payload.type !== 'REGISTER') {
      return res.status(403).json({ message: 'Token non autorisé pour cette opération.' });
    }

    const { firstName, lastName, phone, password } = req.body;

    const user = await authService.completeRegistration({
      email: payload.email,
      password,
      firstName,
      lastName,
      phone,
      otpVerified: payload.otpVerified,
    });

    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  authController: {
    register,
    login,
    googleAuth,
    logout,
    me,
    requestOtp,
    verifyOtp,
    completeRegistration,
  },
};