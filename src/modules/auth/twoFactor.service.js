// backend/src/modules/auth/twoFactor.service.js
// Service dédié à la double authentification (TOTP - Google Authenticator / Authy)
// ⚠️ otplib v13 a changé son API : plus d'objet `authenticator`, fonctions à plat
// et désormais asynchrones (generate/verify retournent des Promises).

const crypto = require('crypto');
const otplib = require('otplib');
const QRCode = require('qrcode');
const prisma = require('../../config/database');

const APP_NAME = 'SonShop';

// ─── Génère un nouveau secret TOTP + le QR code à scanner ─────────────────
async function generateTwoFactorSecret(userId, email) {
  const secret = otplib.generateSecret();
  const otpauthUrl = otplib.generateURI({
    strategy: 'totp',
    issuer: APP_NAME,
    label: email,
    secret,
  });
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

  // On stocke le secret tout de suite, mais twoFactorEnabled reste false
  // tant que l'utilisateur n'a pas confirmé avec un code valide (étape enable).
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorSecret: secret },
  });

  return { secret, qrCodeDataUrl };
}

// ─── Vérifie un code TOTP à 6 chiffres contre le secret stocké ────────────
async function verifyTotpCode(secret, code) {
  if (!secret || !code) return false;
  const result = await otplib.verify({ strategy: 'totp', token: code, secret });
  return result.valid;
}

// ─── Génère des codes de secours (usage unique, en cas de perte du téléphone) ─
function generateBackupCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    codes.push(crypto.randomBytes(5).toString('hex').toUpperCase());
  }
  return codes;
}

// ─── Hash les codes de secours avant stockage (jamais en clair en base) ───
function hashBackupCodes(codes) {
  return codes.map((code) =>
    crypto.createHash('sha256').update(code).digest('hex')
  );
}

function verifyBackupCode(storedHashesJson, submittedCode) {
  if (!storedHashesJson) return { valid: false, remaining: null };
  const storedHashes = JSON.parse(storedHashesJson);
  const submittedHash = crypto
    .createHash('sha256')
    .update(submittedCode.toUpperCase())
    .digest('hex');

  const index = storedHashes.indexOf(submittedHash);
  if (index === -1) return { valid: false, remaining: storedHashes };

  // Usage unique : on retire le code utilisé
  const remaining = storedHashes.filter((_, i) => i !== index);
  return { valid: true, remaining };
}

// ─── Active la 2FA après vérification du premier code ─────────────────────
async function enableTwoFactor(userId, code) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.twoFactorSecret) {
    const error = new Error('Aucun secret 2FA en attente. Relancez la configuration.');
    error.status = 400;
    throw error;
  }

  const isValid = await verifyTotpCode(user.twoFactorSecret, code);
  if (!isValid) {
    const error = new Error('Code invalide.');
    error.status = 400;
    throw error;
  }

  const backupCodes = generateBackupCodes();
  const hashedCodes = hashBackupCodes(backupCodes);

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: true,
      twoFactorBackupCodes: JSON.stringify(hashedCodes),
    },
  });

  // Les codes en clair ne sont renvoyés qu'une seule fois, à cet instant précis.
  return { backupCodes };
}

// ─── Désactive la 2FA (nécessite le mot de passe + un code valide en amont, vérifié dans le controller) ─
async function disableTwoFactor(userId) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorBackupCodes: null,
    },
  });
}

module.exports = {
  generateTwoFactorSecret,
  verifyTotpCode,
  generateBackupCodes,
  hashBackupCodes,
  verifyBackupCode,
  enableTwoFactor,
  disableTwoFactor,
};