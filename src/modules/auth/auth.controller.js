// backend/src/modules/auth/auth.controller.js
// Remplace ENTIÈREMENT le fichier existant

const authService = require('./auth.service');
const { verifyToken } = require('../../utils/jwt.utils');

// ─── Inscription classique (conservée) ───────────────────────────────────────
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
// ─── Logout ───────────────────────────────────────────────────────────────────
async function logout(req, res) {
  res.json({ message: 'Déconnexion réussie' });
}

// ─── Me ───────────────────────────────────────────────────────────────────────
async function me(req, res) {
  res.json(req.user);
}

// ─── ÉTAPE 1 : Demande d'OTP pour inscription ─────────────────────────────────
// ─── ÉTAPE 2 : Vérification de l'OTP ─────────────────────────────────────────
// ─── ÉTAPE 3 : Finalisation du compte (définition du mot de passe) ────────────
module.exports = {
  authController: {
    login,
    logout,
    me,
  },
};