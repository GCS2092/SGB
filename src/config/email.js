const axios = require('axios');

async function sendEmail({ to, subject, html, attachments = [] }) {
  if (!process.env.BREVO_API_KEY) {
    console.error('❌ [sendEmail] BREVO_API_KEY manquante dans les variables d\'environnement');
    throw new Error('Configuration email manquante (BREVO_API_KEY).');
  }

  const payload = {
    sender: { email: process.env.FROM_EMAIL || 'noreply@example.com', name: 'SGB' },
    to: [{ email: to }],
    subject,
    htmlContent: html,
  };

  if (attachments.length > 0) {
    payload.attachment = attachments.map(({ filename, content }) => ({
      name: filename,
      content, // base64 string attendu par Brevo
    }));
  }

  try {
    const response = await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      payload,
      {
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log('✅ [sendEmail] Brevo OK — messageId:', response.data?.messageId);
    return response.data;
  } catch (err) {
    // C'est ICI que se cache la vraie raison de l'échec.
    // axios met le detail de l'erreur API dans err.response.data,
    // pas dans err.message — d'où le 500 muet que tu observais.
    const brevoError = err.response?.data;
    console.error('❌ [sendEmail] Echec envoi Brevo');
    console.error('   Status HTTP :', err.response?.status);
    console.error('   Detail Brevo:', JSON.stringify(brevoError, null, 2));
    console.error('   Destinataire:', to);

    // On relance une erreur avec un message exploitable côté contrôleur
    const message = brevoError?.message || brevoError?.code || err.message || 'Erreur inconnue Brevo';
    throw new Error(`Echec envoi email (Brevo): ${message}`);
  }
}

module.exports = { sendEmail };