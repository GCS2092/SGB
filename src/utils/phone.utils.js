function normalizePhone(phone) {
  if (!phone) return null;
  return String(phone).trim().replace(/[^\d+]/g, '');
}

function isValidPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return false;

  const digitsOnly = normalized.replace(/\D/g, '');

  // Longueur raisonnable pour un numéro international (E.164 : 8 à 15 chiffres)
  if (digitsOnly.length < 8 || digitsOnly.length > 15) return false;

  // Rejette les suites de chiffres identiques (ex: 0000000000)
  if (/^(\d)\1+$/.test(digitsOnly)) return false;

  return true;
}

module.exports = { normalizePhone, isValidPhone };