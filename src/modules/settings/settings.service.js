const prisma = require('../../config/database');

const DEFAULT_SETTINGS = {
  // Entreprise
  company_name: 'SonShop',
  company_address: '',
  company_phone: '',
  company_email: '',
  // Mobile Money
  wave_number: '',
  orange_money_number: '',
  free_money_number: '',
  payment_instructions: 'Envoyez le montant exact puis cliquez sur "J\'ai payé".',
  // WhatsApp
  whatsapp_number: '',
  // Livraison locale
  delivery_fee: '2000',
  free_delivery_threshold: '50000',
  reservation_expiry_hours: '24',
  default_country_code: '+221',
  // Livraison Congo
  congo_express_rate: '15000',
  congo_groupage_rate: '8000',
  congo_groupage_gift: 'un cadeau surprise',
  // Sénégal — acompte pour grosses commandes COD
  // 0 = désactivé. Ex: '100000' = acompte demandé si total >= 100 000 FCFA
  deposit_threshold: '0',
  // Pourcentage d'acompte demandé (défaut 30%)
  deposit_percent: '30',
};

async function getSettings() {
  const rows = await prisma.setting.findMany();
  const result = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

async function updateSettings(data) {
  const updates = Object.entries(data).map(([key, value]) =>
    prisma.setting.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) },
    })
  );
  await prisma.$transaction(updates);
  return getSettings();
}

module.exports = { getSettings, updateSettings };
