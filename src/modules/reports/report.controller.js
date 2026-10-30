const { collectReportData } = require('./report.service');
const { buildReportPdf } = require('./report-pdf.service');
const { sendEmail } = require('../../config/email');
const { buildReportEmail } = require('../../utils/email.utils');
const { getSettings } = require('../settings/settings.service');

async function downloadReport(req, res) {
  try {

    const { storeId, from, to } = req.query;

    if (!storeId || !from || !to) {
      return res.status(400).json({
        error: 'storeId, from et to sont requis.'
      });
    }

    const data = await collectReportData(storeId, from, to);

    const pdfBuffer = await buildReportPdf(data);

    const filename = `rapport-${storeId}-${from}-${to}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.send(pdfBuffer);
  } catch (err) {
    console.error('❌ Erreur downloadReport:', err);
    res.status(500).json({
      error: 'Erreur lors de la génération du rapport.'
    });
  }
}

async function sendReportByEmail(req, res) {
  try {

    const { storeId, from, to } = req.body;

    if (!storeId || !from || !to) {
      return res.status(400).json({
        error: 'storeId, from et to sont requis.'
      });
    }

    const settings = await getSettings();
    const storeName = settings.company_name || 'SGB';

    const recipient = req.body?.email || process.env.ADMIN_EMAIL;

    if (!recipient) {
      return res.status(400).json({
        error: 'Aucun email destinataire fourni.'
      });
    }

    const data = await collectReportData(storeId, from, to);

    const pdfBuffer = await buildReportPdf(data);

    const pdfBase64 = pdfBuffer.toString('base64');
    const filename = `rapport-${storeId}-${from}-${to}.pdf`;

    const emailData = buildReportEmail({
      period: data.period,
      financial: data.financial,
      orders: data.orders,
      products: data.products,
      stock: data.stock,
      expenses: data.expenses,
      storeName,
    });

    // sendEmail relance maintenant une erreur explicite si Brevo refuse,
    // donc on l'attrape ici pour renvoyer un message utile au frontend
    // au lieu d'un simple 500 muet.
    await sendEmail({
      to: recipient,
      subject: emailData.subject,
      html: emailData.html,
      attachments: [
        {
          filename,
          content: pdfBase64,
        },
      ],
    });

    res.json({
      message: `Rapport envoyé à ${recipient}`
    });

  } catch (err) {
    console.error('❌ Erreur sendReportByEmail:', err);

    res.status(500).json({
      error: err.message || "Erreur lors de l'envoi du rapport."
    });
  }
}

module.exports = { downloadReport, sendReportByEmail };