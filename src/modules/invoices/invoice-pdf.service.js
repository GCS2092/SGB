const path = require('path');
const PDFDocument = require('pdfkit');
const { getSettings } = require('../settings/settings.service');
const prisma = require('../../config/database');

const LOGO_PATH = path.join(__dirname, '../../assets/logo.png');

const PALETTE_SONSHOP = {
  primary:   '#1a1a2e',
  accent:    '#c8a96e',
  accentDk:  '#a8894e',
  white:     '#ffffff',
  offWhite:  '#f8f7f5',
  border:    '#e8e4dc',
  textLight: '#6b6b80',
  success:   '#2d6a4f',
  danger:    '#c0392b',
  tagline:   'MODE & STYLE',
  brandMain: 'SON',
  brandSub:  'SHOP',
  footerBg:  '#1a1a2e',
};

const PALETTE_SONTECH = {
  primary:   '#0f172a',
  accent:    '#3b82f6',
  accentDk:  '#2563eb',
  white:     '#ffffff',
  offWhite:  '#f0f6ff',
  border:    '#dbeafe',
  textLight: '#64748b',
  success:   '#2d6a4f',
  danger:    '#c0392b',
  tagline:   'TECH & ELECTRONIQUE',
  brandMain: 'SON',
  brandSub:  'TECH',
  footerBg:  '#0f172a',
};

function getPalette(store) {
  if (!store) return PALETTE_SONSHOP;
  const name = (store.name || '').toLowerCase();
  const code = (store.code || '').toLowerCase();
  if (name.includes('tech') || code.includes('tech')) return PALETTE_SONTECH;
  return PALETTE_SONSHOP;
}

function fcfa(amount) {
  return `${Number(amount || 0).toLocaleString('fr-FR')} FCFA`;
}

function dateFr(date) {
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function getClientInfo(order) {
  if (order.user) {
    return {
      name:  `${order.user.firstName} ${order.user.lastName}`.trim(),
      email: order.user.email || '',
      phone: order.user.phone || '',
    };
  }
  const addr = order.shippingAddress || {};
  return {
    name:  order.guestName || addr.fullName || 'Client',
    email: order.guestEmail || '',
    phone: order.guestPhone || addr.phone || '',
  };
}

function paymentMethodLabel(method) {
  const labels = {
    CASH_ON_DELIVERY: 'Paiement a la livraison',
    MOBILE_MONEY:     'Mobile Money',
  };
  return labels[method] || method || '';
}

function statusLabel(status) {
  const labels = {
    GENERATED:  'Generee',
    SENT:       'Envoyee',
    PAID:       'Payee',
    CANCELLED:  'Annulee',
  };
  return labels[status] || status;
}

function roundedRect(doc, x, y, w, h, r, fill) {
  doc.save()
    .roundedRect(x, y, w, h, r)
    .fill(fill)
    .restore();
}

async function buildInvoicePdf(invoice) {
  const store = invoice.storeId
    ? await prisma.store.findUnique({ where: { id: invoice.storeId } })
    : null;

  const C = getPalette(store);

  const settings  = await getSettings(invoice.storeId);
  const company   = settings.company_name    || store?.name || 'SonShop';
  const address   = settings.company_address || 'Dakar, Senegal';
  const phone     = settings.company_phone   || settings.whatsapp_number || '';
  const email     = settings.company_email   || '';

  const order  = invoice.order;
  const client = getClientInfo(order);
  const addr   = order.shippingAddress || {};

  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 0, size: 'A4' });
    const chunks = [];

    doc.on('data',  (chunk) => chunks.push(chunk));
    doc.on('end',   ()      => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width;
    const H = doc.page.height;
    const M = 45;

    try {
      doc.save();
      doc.opacity(0.05);
      const wmSize = 320;
      doc.image(LOGO_PATH, (W - wmSize) / 2, (H - wmSize) / 2, { width: wmSize, height: wmSize });
      doc.restore();
    } catch (e) {
      doc.restore();
    }

    doc.rect(0, 0, W, 110).fill(C.primary);

    doc.fontSize(26).font('Helvetica-Bold').fillColor(C.accent)
       .text(C.brandMain, M, 28, { continued: true })
       .fillColor(C.white)
       .text(C.brandSub);

    doc.fontSize(8).font('Helvetica').fillColor('#aaaaaa')
       .text(C.tagline, M, 62, { characterSpacing: 2 });

    doc.fontSize(22).font('Helvetica-Bold').fillColor(C.accent)
       .text('FACTURE', 0, 30, { align: 'right', width: W - M });

    doc.fontSize(9).font('Helvetica').fillColor('#cccccc')
       .text(invoice.invoiceNumber, 0, 58, { align: 'right', width: W - M });

    doc.rect(0, 110, W, 4).fill(C.accent);

    const infoTop = 130;

    doc.fontSize(8).font('Helvetica-Bold').fillColor(C.textLight)
       .text('DE', M, infoTop, { characterSpacing: 1 });

    doc.fontSize(11).font('Helvetica-Bold').fillColor(C.primary)
       .text(company, M, infoTop + 14);

    doc.fontSize(9).font('Helvetica').fillColor('#444444');
    if (address) doc.text(address, M, doc.y + 2);
    if (phone)   doc.text(`Tel : ${phone}`, M, doc.y + 2);
    if (email)   doc.text(email, M, doc.y + 2);

    const colRight = W / 2 + 10;
    doc.fontSize(8).font('Helvetica-Bold').fillColor(C.textLight)
       .text('FACTURE A', colRight, infoTop, { characterSpacing: 1 });

    doc.fontSize(11).font('Helvetica-Bold').fillColor(C.primary)
       .text(client.name, colRight, infoTop + 14);

    doc.fontSize(9).font('Helvetica').fillColor('#444444');
    if (client.email) doc.text(client.email, colRight, doc.y + 2);
    if (client.phone) doc.text(client.phone, colRight, doc.y + 2);
    if (addr.street) {
      const addrLine = [addr.street, addr.city, addr.country].filter(Boolean).join(', ');
      doc.text(addrLine, colRight, doc.y + 2, { width: W - colRight - M });
    }

    const metaTop = 255;
    roundedRect(doc, M, metaTop, W - M * 2, 80, 6, C.offWhite);
    doc.rect(M, metaTop, W - M * 2, 80).stroke(C.border);

    const metaItems = [
      ['N COMMANDE',  order.orderNumber],
      ['DATE',        dateFr(invoice.issuedAt)],
      ['STATUT',      statusLabel(invoice.status)],
      ['PAIEMENT',    paymentMethodLabel(order.paymentMethod)],
    ];

    const cellW = (W - M * 2) / metaItems.length;

    metaItems.forEach(([label, value], i) => {
      const cx   = M + i * cellW + 14;
      const maxW = cellW - 18;

      doc.fontSize(7).font('Helvetica-Bold').fillColor(C.textLight)
         .text(label, cx, metaTop + 12, { characterSpacing: 0.5, width: maxW, ellipsis: true });

      doc.fontSize(9).font('Helvetica-Bold').fillColor(C.primary)
         .text(String(value || ''), cx, metaTop + 30, { width: maxW, ellipsis: true });
    });

    const tTop = metaTop + 102;
    const cols = { product: M, qty: 310, pu: 380, total: 460 };

    roundedRect(doc, M, tTop, W - M * 2, 26, 4, C.primary);

    doc.fontSize(8).font('Helvetica-Bold').fillColor(C.white);
    doc.text('PRODUIT',    cols.product + 8, tTop + 9);
    doc.text('QTE',        cols.qty,         tTop + 9, { width: 60, align: 'center' });
    doc.text('PRIX UNIT.', cols.pu,          tTop + 9, { width: 70, align: 'right' });
    doc.text('TOTAL',      cols.total,       tTop + 9, { width: 55, align: 'right' });

    let y = tTop + 26;
    const items = order.items || [];

    items.forEach((item, i) => {
      const rowH  = 30;
      const label = item.variantLabel
        ? `${item.productName}  (${item.variantLabel})`
        : item.productName;

      if (i % 2 === 0) {
        doc.rect(M, y, W - M * 2, rowH).fill(C.offWhite);
      }

      doc.fontSize(9).font('Helvetica-Bold').fillColor(C.primary)
         .text(label, cols.product + 8, y + 5, { width: 240 });

      doc.font('Helvetica').fillColor('#444444');
      doc.text(String(item.quantity), cols.qty,   y + 5, { width: 60, align: 'center' });
      doc.text(fcfa(item.price),      cols.pu,    y + 5, { width: 70, align: 'right' });
      doc.text(fcfa(item.subtotal),   cols.total, y + 5, { width: 55, align: 'right' });

      doc.rect(M, y + rowH - 1, W - M * 2, 1).fill(C.border);
      y += rowH;
    });

    y += 12;
    const totalsX = 360;
    const totalsW = W - M - totalsX;

    function totalsRow(label, value, bold = false, color = '#444444') {
      doc.fontSize(9)
         .font(bold ? 'Helvetica-Bold' : 'Helvetica')
         .fillColor(C.textLight)
         .text(label, totalsX, y);
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
         .fillColor(color)
         .text(value, totalsX, y, { width: totalsW, align: 'right' });
      y += 18;
    }

    totalsRow('Sous-total', fcfa(invoice.subtotal));
    if (invoice.shippingCost > 0)  totalsRow('Livraison',       fcfa(invoice.shippingCost));
    if (invoice.discount     > 0)  totalsRow('Remise',          `-${fcfa(invoice.discount)}`,      false, C.success);
    if (invoice.storeDiscount > 0) totalsRow('Remise boutique', `-${fcfa(invoice.storeDiscount)}`, false, C.success);
    if (invoice.tax          > 0)  totalsRow('Taxes',           fcfa(invoice.tax));

    doc.rect(totalsX, y, totalsW, 1).fill(C.accent);
    y += 8;

    roundedRect(doc, totalsX - 10, y, totalsW + 10, 38, 6, C.primary);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(C.white)
       .text('TOTAL', totalsX, y + 12);
    doc.fontSize(14).font('Helvetica-Bold').fillColor(C.accent)
       .text(fcfa(invoice.total), totalsX, y + 10, { width: totalsW, align: 'right' });

    if (order.notes) {
      const noteTop = y + 58;
      roundedRect(doc, M, noteTop, W - M * 2, 40, 6, C.offWhite);
      doc.rect(M, noteTop, 3, 40).fill(C.accent);
      doc.fontSize(8).font('Helvetica-Bold').fillColor(C.textLight)
         .text('NOTE', M + 12, noteTop + 8);
      doc.fontSize(9).font('Helvetica').fillColor('#444444')
         .text(order.notes, M + 12, noteTop + 20, { width: W - M * 2 - 20 });
    }

    doc.rect(0, H - 52, W, 52).fill(C.footerBg);
    doc.rect(0, H - 52, W, 3).fill(C.accent);

    doc.fontSize(8).font('Helvetica').fillColor('#888888')
       .text(
         `Document genere automatiquement par ${company}  .  Les montants sont en FCFA  .  Dakar, Senegal`,
         0, H - 32,
         { align: 'center', width: W },
       );

    doc.end();
  });
}

module.exports = { buildInvoicePdf };
