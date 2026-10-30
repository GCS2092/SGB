const axios = require('axios');

const BASE_URL = 'https://api.cinetpay.net';

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const { data } = await axios.post(`${BASE_URL}/v1/oauth/login`, {
    api_key: process.env.CINETPAY_API_KEY,
    api_password: process.env.CINETPAY_API_PASSWORD,
  });

  cachedToken = data.access_token;

  tokenExpiry =
    Date.now() + Math.max((data.expires_in - 60) * 1000, 30_000);

  return cachedToken;
}

async function initierPaiement({
  merchantTransactionId,
  amount,
  designation,
  customer,
  notifyUrl,
  successUrl,
  failedUrl,
}) {
  const token = await getAccessToken();

  const payload = {
    currency: 'XOF',
    merchant_transaction_id: merchantTransactionId,
    amount,
    lang: 'fr',
    designation,

    client_email: customer.email,
    client_phone_number: customer.phone,
    client_first_name: customer.firstName,
    client_last_name: customer.lastName,

    success_url: successUrl,
    failed_url: failedUrl,
    notify_url: notifyUrl,
  };

  // Diagnostic temporaire
  console.log(
    'Payload envoyé à CinetPay:',
    JSON.stringify(payload, null, 2)
  );

  // Diagnostic IP publique Render
  try {
    const { data: ipData } = await axios.get(
      'https://api.ipify.org?format=json',
      {
        timeout: 5000,
      }
    );

    console.log(
      '🌍 IP SORTANTE RÉELLE POUR CINETPAY :',
      ipData.ip
    );
  } catch (error) {
    console.warn(
      '⚠️ Impossible de récupérer l’IP publique Render:',
      error.message
    );
  }

  const { data } = await axios.post(
    `${BASE_URL}/v1/payment`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );

  // Diagnostic temporaire
  console.log(
    '✅ Réponse CinetPay complète:',
    JSON.stringify(data, null, 2)
  );

  console.log(
    '🔗 PAYMENT URL:',
    data.payment_url
  );

  return data;
}

async function verifierStatut(merchantTransactionId) {
  const token = await getAccessToken();

  const { data } = await axios.get(
    `${BASE_URL}/v1/payment/${merchantTransactionId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );

  console.log(
    '🔎 Vérification CinetPay:',
    JSON.stringify(data, null, 2)
  );

  return data;
}

module.exports = {
  getAccessToken,
  initierPaiement,
  verifierStatut,
};