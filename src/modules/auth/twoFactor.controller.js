// backend/src/modules/auth/twoFactor.controller.js

const bcrypt = require('bcryptjs');
const prisma = require('../../config/database');
const authService = require('./auth.service');
const twoFactorService = require('./twoFactor.service');

// ─── Génère le secret + QR code à scanner (première configuration) ──────
async function setupTwoFactor(req, res, next) {
  try {
    const { id, email } = req.twoFactorPayload;
    const { secret, qrCodeDataUrl } = await twoFactorService.generateTwoFactorSecret(id, email);
    res.json({
      qrCodeDataUrl,
      manualEntryKey: secret,
      message: 'Scannez ce QR code avec Google Authenticator ou Authy, puis confirmez avec un code.',
    });
  } catch (error) {
    next(error);
  }
}

// ─── Confirme la configuration avec le premier code généré ──────────────
async function enableTwoFactor(req, res, next) {
  try {
    const { id } = req.twoFactorPayload;
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ message: 'Code requis.' });
    }

    const { backupCodes } = await twoFactorService.enableTwoFactor(id, code);
    const session = await authService.completeTwoFactorLogin(id);

    res.json({
      ...session,
      backupCodes,
      message: 'Double authentification activée. Conservez ces codes de secours en lieu sûr, ils ne seront plus affichés.',
    });
  } catch (error) {
    next(error);
  }
}

// ─── Vérifie le code lors d'une connexion (2FA déjà active) ──────────────
async function verifyTwoFactorLogin(req, res, next) {
  try {
    const { id } = req.twoFactorPayload;
    const { code, backupCode } = req.body;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur introuvable.' });
    }

    let isValid = false;

    if (code) {
      isValid = await twoFactorService.verifyTotpCode(user.twoFactorSecret, code);
    } else if (backupCode) {
      const result = twoFactorService.verifyBackupCode(user.twoFactorBackupCodes, backupCode);
      isValid = result.valid;
      if (isValid) {
        await prisma.user.update({
          where: { id },
          data: { twoFactorBackupCodes: JSON.stringify(result.remaining) },
        });
      }
    } else {
      return res.status(400).json({ message: 'Code ou code de secours requis.' });
    }

    if (!isValid) {
      return res.status(400).json({ message: 'Code invalide.' });
    }

    const session = await authService.completeTwoFactorLogin(id);
    res.json(session);
  } catch (error) {
    next(error);
  }
}

// ─── Désactive la 2FA (session normale déjà authentifiée) ───────────────
async function disableTwoFactor(req, res, next) {
  try {
    const { password, code } = req.body;
    const userId = req.user.id;

    if (!password || !code) {
      return res.status(400).json({ message: 'Mot de passe et code requis pour désactiver la 2FA.' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.password) {
      return res.status(404).json({ message: 'Utilisateur introuvable.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Mot de passe incorrect.' });
    }

    const isCodeValid = await twoFactorService.verifyTotpCode(user.twoFactorSecret, code);
    if (!isCodeValid) {
      return res.status(400).json({ message: 'Code invalide.' });
    }

    await twoFactorService.disableTwoFactor(userId);
    res.json({ message: 'Double authentification désactivée.' });
  } catch (error) {
    next(error);
  }
}
// ─── ÉTAPE 1 : Démarre la reconfiguration (changement d'appareil) ────────
// Réauthentifie l'utilisateur (mot de passe + code actuel OU code de secours),
// puis génère un nouveau secret/QR code. L'ancien secret reste actif tant que
// la nouvelle configuration n'est pas confirmée à l'étape 2.
async function startTwoFactorReconfigure(req, res, next) {
  try {
    const { password, code, backupCode } = req.body;
    const userId = req.user.id;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.password) {
      return res.status(404).json({ message: 'Utilisateur introuvable.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Mot de passe incorrect.' });
    }

    let isValid = false;
    if (code) {
      isValid = await twoFactorService.verifyTotpCode(user.twoFactorSecret, code);
    } else if (backupCode) {
      const result = twoFactorService.verifyBackupCode(user.twoFactorBackupCodes, backupCode);
      isValid = result.valid;
      if (isValid) {
        await prisma.user.update({
          where: { id: userId },
          data: { twoFactorBackupCodes: JSON.stringify(result.remaining) },
        });
      }
    } else {
      return res.status(400).json({ message: 'Code ou code de secours requis.' });
    }

    if (!isValid) {
      return res.status(400).json({ message: 'Code invalide.' });
    }

    // Génère un nouveau secret — l'ancien reste actif jusqu'à confirmation
    const { secret, qrCodeDataUrl } = await twoFactorService.generateTwoFactorSecret(userId, user.email);

    res.json({
      qrCodeDataUrl,
      manualEntryKey: secret,
      message: 'Scannez ce nouveau QR code avec votre nouvel appareil, puis confirmez avec un code.',
    });
  } catch (error) {
    next(error);
  }
}

// ─── ÉTAPE 2 : Confirme la reconfiguration avec le code du nouvel appareil ─
async function confirmTwoFactorReconfigure(req, res, next) {
  try {
    const { code } = req.body;
    const userId = req.user.id;

    const { backupCodes } = await twoFactorService.enableTwoFactor(userId, code);

    res.json({
      backupCodes,
      message: 'Nouvel appareil configuré. Conservez ces nouveaux codes de secours, les anciens ne sont plus valides.',
    });
  } catch (error) {
    next(error);
  }
}
module.exports = {
  setupTwoFactor,
  enableTwoFactor,
  verifyTwoFactorLogin,
  disableTwoFactor,
  startTwoFactorReconfigure,
  confirmTwoFactorReconfigure,
};