const crypto = require('crypto');

function generateOrderNumber() {
  const year = new Date().getFullYear();
  // ✅ 8 caractères hexadécimaux aléatoires cryptographiquement sûrs
  // (~4 milliards de combinaisons, contre 9000 avant) — non énumérable en pratique
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `CMD-${year}-${random}`;
}

module.exports = {
  generateOrderNumber,
};