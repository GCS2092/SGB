const PDFDocument = require('pdfkit');
const { getSettings } = require('../settings/settings.service');

// ── Palette SGB (cohérente avec email.utils.js) ──────────────────────
const C = {
  primary:  '#C8748A', // rose poudré
  gold:     '#C8A96E', // doré accent
  navy:     '#2C2C3E', // fond sombre
  white:    '#FFFFFF',
  offWhite: '#FDF8F5',
  text:     '#2C2C3E',
  textLight:'#7A7585',
  border:   '#EDE4DC',
  success:  '#2D6A4F',
  successBg:'#E8F5E9',
  danger:   '#C0392B',
  dangerBg: '#FCE4E4',
  warning:  '#B8860B',
  warningBg:'#FFF3CD',
};

const PAGE_MARGIN = 40;
const PAGE_WIDTH  = 595.28; // A4 portrait en points
const CONTENT_W   = PAGE_WIDTH - PAGE_MARGIN * 2;

function formatFcfa(amount) {
  return `${Number(amount || 0).toLocaleString('fr-FR')} FCFA`;
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

// ── Helpers de dessin bas-niveau ──────────────────────────────────────────────

function roundedRect(doc, x, y, w, h, r, fillColor) {
  doc.save();
  doc.roundedRect(x, y, w, h, r).fill(fillColor);
  doc.restore();
}

function checkPageBreak(doc, neededHeight) {
  const bottom = doc.page.height - PAGE_MARGIN;
  if (doc.y + neededHeight > bottom) {
    doc.addPage();
    return true;
  }
  return false;
}

// En-tête de section (petit carré couleur + titre + barre dégradée)
// NOTE : pas d'emoji ici — la police Helvetica de pdfkit ne contient pas
// ces glyphes Unicode et ça produit des caractères corrompus à l'affichage
// (ex: "Ø=ÜË"). On utilise un petit carré dessiné à la place.
function sectionHeader(doc, accentColor, title) {
  checkPageBreak(doc, 40);
  doc.moveDown(0.8);
  const y = doc.y;
  doc.save();
  doc.roundedRect(PAGE_MARGIN, y + 1.5, 9, 9, 2).fill(accentColor);
  doc.restore();
  doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(12)
    .text(title.toUpperCase(), PAGE_MARGIN + 16, y);
  doc.moveDown(0.3);
  const lineY = doc.y;
  doc.save();
  doc.rect(PAGE_MARGIN, lineY, CONTENT_W * 0.6, 2).fill(C.primary);
  doc.rect(PAGE_MARGIN + CONTENT_W * 0.6, lineY, CONTENT_W * 0.4, 2).fill(C.gold);
  doc.restore();
  doc.moveDown(0.6);
}

// Carte container avec fond + bordure légère, retourne la position de départ du contenu
function cardStart(doc, height) {
  checkPageBreak(doc, height + 10);
  const x = PAGE_MARGIN;
  const y = doc.y;
  roundedRect(doc, x, y, CONTENT_W, height, 8, C.offWhite);
  doc.save();
  doc.roundedRect(x, y, CONTENT_W, height, 8).lineWidth(1).strokeColor(C.border).stroke();
  doc.restore();
  return { x, y };
}

// Une ligne label / valeur dans une carte
function kvRow(doc, x, y, w, label, value, opts = {}) {
  const labelColor = opts.labelColor || C.text;
  const valueColor = opts.valueColor || C.navy;
  const bold = opts.bold || false;
  doc.fillColor(labelColor).font('Helvetica').fontSize(9.5).text(label, x, y, { width: w * 0.6 });
  doc.fillColor(valueColor).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5)
    .text(value, x + w * 0.6, y, { width: w * 0.4, align: 'right' });
}

// Barre de progression horizontale dessinée
function progressBar(doc, x, y, w, pct, color) {
  const h = 6;
  roundedRect(doc, x, y, w, h, 3, '#E8E4DC');
  const fillW = Math.max(0, Math.min(100, pct)) / 100 * w;
  if (fillW > 0) roundedRect(doc, x, y, fillW, h, 3, color);
}

// ── Cartes KPI (4 colonnes) ───────────────────────────────────────────────────
function drawKpiCards(doc, kpis) {
  const gap = 10;
  const cardW = (CONTENT_W - gap * 3) / 4;
  const cardH = 64;
  checkPageBreak(doc, cardH + 10);
  const y = doc.y;

  kpis.forEach((kpi, i) => {
    const x = PAGE_MARGIN + i * (cardW + gap);
    roundedRect(doc, x, y, cardW, cardH, 8, C.offWhite);
    doc.save();
    doc.roundedRect(x, y, cardW, cardH, 8).lineWidth(1).strokeColor(C.border).stroke();
    doc.restore();
    // bande couleur en haut de carte
    doc.save();
    doc.roundedRect(x, y, cardW, 5, 2).fill(kpi.color);
    doc.restore();

    doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(11.5)
      .text(kpi.value, x + 8, y + 16, { width: cardW - 16, align: 'left' });
    doc.fillColor(C.textLight).font('Helvetica').fontSize(7.5)
      .text(kpi.label.toUpperCase(), x + 8, y + 38, { width: cardW - 16, align: 'left', characterSpacing: 0.3 });
  });

  doc.y = y + cardH;
  doc.moveDown(0.8);
}

async function buildReportPdf(data) {
  const settings = await getSettings();
  // ⚠️ FIX : le fallback pointait vers "SGB" (mauvais projet/copier-coller).
  // Ta boutique s'appelle SGB — c'est le vrai fallback à utiliser si
  // settings.company_name n'est pas configuré en base.
  const companyName    = settings.company_name    || 'SGB';
  const companyAddress = settings.company_address || '';
  const companyPhone   = settings.company_phone   || '';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: PAGE_MARGIN, size: 'A4', bufferPages: true });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── EN-TÊTE (bandeau marine pleine largeur) ────────────────────────────
    const headerH = 86;
    doc.rect(0, 0, doc.page.width, headerH).fill(C.navy);

    // ⚠️ FIX : le nom "URBAN"/"BEAUTY" était codé en dur ici, donc le PDF
    // affichait toujours "SGB" peu importe la vraie boutique.
    // On utilise maintenant companyName dynamiquement (ex: "SGB").
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(20)
      .text(companyName.toUpperCase(), PAGE_MARGIN, 26);
    doc.fillColor('#aaaaaa').font('Helvetica').fontSize(7.5)
      .text('RAPPORT DE GESTION AUTOMATIQUE', PAGE_MARGIN, 50, { characterSpacing: 1.5 });

    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(13)
      .text('RAPPORT DE GESTION', PAGE_MARGIN, 24, { width: CONTENT_W, align: 'right' });
    doc.fillColor('#cccccc').font('Helvetica').fontSize(8.5)
      .text(`Période : ${formatDate(data.period.from)} au ${formatDate(data.period.to)}`,
        PAGE_MARGIN, 44, { width: CONTENT_W, align: 'right' });
    doc.text(`Généré le ${formatDate(new Date())}`,
      PAGE_MARGIN, 58, { width: CONTENT_W, align: 'right' });

    // petite ligne dégradée rose/or sous le bandeau
    doc.rect(0, headerH, doc.page.width * 0.6, 3).fill(C.primary);
    doc.rect(doc.page.width * 0.6, headerH, doc.page.width * 0.4, 3).fill(C.gold);

    doc.y = headerH + 24;

    // adresse / téléphone boutique (petite ligne discrète)
    if (companyAddress || companyPhone) {
      doc.fillColor(C.textLight).font('Helvetica').fontSize(8.5)
        .text([companyAddress, companyPhone && `Tél : ${companyPhone}`].filter(Boolean).join('  ·  '),
          PAGE_MARGIN, doc.y);
      doc.moveDown(0.6);
    }

    // ── KPI CARDS ────────────────────────────────────────────────────────
    const beneficePositif = data.financial.beneficeEstime >= 0;
    drawKpiCards(doc, [
      { label: "Chiffre d'affaires", value: formatFcfa(data.financial.chiffreAffaires), color: C.primary },
      { label: 'Bénéfice estimé',    value: formatFcfa(data.financial.beneficeEstime),  color: beneficePositif ? C.success : C.danger },
      { label: 'Commandes',          value: String(data.orders.total),                  color: C.navy },
      { label: 'Facturé',            value: formatFcfa(data.financial.totalInvoiced),    color: C.gold },
    ]);

    // ── ÉQUILIBRE FINANCIER ─────────────────────────────────────────────
    sectionHeader(doc, C.navy, 'Équilibre financier');
    {
      const ca = data.financial.chiffreAffaires || 1;
      const rows = [
        ["Chiffre d'affaires",     data.financial.chiffreAffaires, C.primary],
        ['Coût des ventes (COGS)', data.financial.cogs,            C.navy],
        ['Dépenses',               data.financial.totalExpenses,   C.danger],
      ];
      const cardH = 22 * rows.length + 50;
      const { x, y } = cardStart(doc, cardH);
      let cy = y + 14;
      const innerW = CONTENT_W - 32;
      const innerX = x + 16;

      rows.forEach(([label, value, color]) => {
        doc.fillColor(C.text).font('Helvetica').fontSize(9).text(label, innerX, cy, { width: innerW * 0.4 });
        progressBar(doc, innerX + innerW * 0.42, cy + 1, innerW * 0.38, (value / ca) * 100, color);
        doc.fillColor(C.textLight).font('Helvetica').fontSize(8.5)
          .text(formatFcfa(value), innerX + innerW * 0.82, cy, { width: innerW * 0.18, align: 'right' });
        cy += 22;
      });

      // bandeau bénéfice
      const beneficeBg = beneficePositif ? C.successBg : C.dangerBg;
      const beneficeColor = beneficePositif ? C.success : C.danger;
      roundedRect(doc, innerX, cy + 4, innerW, 26, 6, beneficeBg);
      doc.fillColor(beneficeColor).font('Helvetica-Bold').fontSize(9.5)
        .text('Bénéfice estimé', innerX + 10, cy + 13);
      doc.fontSize(11)
        .text(formatFcfa(data.financial.beneficeEstime), innerX, cy + 12, { width: innerW - 10, align: 'right' });

      doc.y = y + cardH;
    }

    // ── COMMANDES PAR STATUT ────────────────────────────────────────────
    sectionHeader(doc, C.primary, 'Commandes par statut');
    {
      const statusLabels = {
        PENDING: 'En attente', CONFIRMED: 'Confirmées', PROCESSING: 'En préparation',
        SHIPPED: 'Expédiées', DELIVERED: 'Livrées', CANCELLED: 'Annulées', DRAFT: 'Brouillons',
      };
      const statusColors = {
        PENDING: C.warning, CONFIRMED: '#0d47a1', PROCESSING: C.gold,
        SHIPPED: '#1565c0', DELIVERED: C.success, CANCELLED: C.danger, DRAFT: '#888888',
      };
      const entries = Object.entries(data.orders.byStatus || {});
      const total = data.orders.total || 1;

      if (entries.length === 0) {
        doc.fillColor(C.textLight).font('Helvetica').fontSize(9).text('Aucune commande sur la période.');
        doc.moveDown(0.5);
      } else {
        const cardH = 20 * entries.length + 24;
        const { x, y } = cardStart(doc, cardH);
        let cy = y + 12;
        const innerX = x + 16;
        const innerW = CONTENT_W - 32;

        entries.forEach(([status, count]) => {
          const pct = Math.round((count / total) * 100);
          const color = statusColors[status] || C.primary;
          doc.fillColor(C.text).font('Helvetica').fontSize(8.8)
            .text(statusLabels[status] || status, innerX, cy, { width: innerW * 0.32 });
          progressBar(doc, innerX + innerW * 0.34, cy + 1, innerW * 0.42, pct, color);
          doc.fillColor(C.textLight).font('Helvetica').fontSize(8.3)
            .text(`${count} (${pct}%)`, innerX + innerW * 0.78, cy, { width: innerW * 0.22, align: 'right' });
          cy += 20;
        });

        doc.y = y + cardH;
      }
    }

    // ── TOP 5 CLIENTS ─────────────────────────────────────────────────────
    sectionHeader(doc, C.gold, 'Top 5 clients');
    {
      const clients = (data.orders.topClients || []).slice(0, 5);
      if (clients.length === 0) {
        doc.fillColor(C.textLight).font('Helvetica').fontSize(9).text('Aucune donnée disponible.');
        doc.moveDown(0.5);
      } else {
        const cardH = 22 * clients.length + 24;
        const { x, y } = cardStart(doc, cardH);
        let cy = y + 12;
        const innerX = x + 16;
        const innerW = CONTENT_W - 32;

        clients.forEach((c, i) => {
          // pastille de rang
          const badgeColor = i === 0 ? C.gold : C.border;
          const badgeTextColor = i === 0 ? C.white : C.textLight;
          doc.save();
          doc.circle(innerX + 8, cy + 6, 8).fill(badgeColor);
          doc.restore();
          doc.fillColor(badgeTextColor).font('Helvetica-Bold').fontSize(8)
            .text(String(i + 1), innerX, cy + 2, { width: 16, align: 'center' });

          doc.fillColor(C.text).font('Helvetica').fontSize(9)
            .text(`${c.name}`, innerX + 22, cy, { width: innerW * 0.5, continued: false });
          doc.fillColor(C.textLight).font('Helvetica').fontSize(7.5)
            .text(`${c.count} commande${c.count > 1 ? 's' : ''}`, innerX + 22, cy + 12);
          doc.fillColor(C.primary).font('Helvetica-Bold').fontSize(9)
            .text(formatFcfa(c.total), innerX, cy, { width: innerW - 4, align: 'right' });

          cy += 22;
        });

        doc.y = y + cardH;
      }
    }

    // ── TOP 5 PRODUITS VENDUS ────────────────────────────────────────────
    sectionHeader(doc, C.gold, 'Top 5 produits vendus');
    {
      const prods = (data.products.topProducts || []).slice(0, 5);
      if (prods.length === 0) {
        doc.fillColor(C.textLight).font('Helvetica').fontSize(9).text('Aucune vente livrée sur la période.');
        doc.moveDown(0.5);
      } else {
        const topRevenue = prods[0]?.revenue || 1;
        const cardH = 22 * prods.length + 24;
        const { x, y } = cardStart(doc, cardH);
        let cy = y + 12;
        const innerX = x + 16;
        const innerW = CONTENT_W - 32;

        prods.forEach((p) => {
          doc.fillColor(C.text).font('Helvetica').fontSize(9)
            .text(p.name, innerX, cy, { width: innerW * 0.45 });
          doc.fillColor(C.textLight).font('Helvetica').fontSize(8)
            .text(`${p.quantity} unités`, innerX + innerW * 0.45, cy, { width: innerW * 0.2, align: 'center' });
          doc.fillColor(C.primary).font('Helvetica-Bold').fontSize(9)
            .text(formatFcfa(p.revenue), innerX + innerW * 0.65, cy, { width: innerW * 0.35, align: 'right' });
          cy += 13;
          progressBar(doc, innerX, cy, innerW, (p.revenue / topRevenue) * 100, C.gold);
          cy += 11;
        });

        doc.y = y + cardH;
      }
    }

    // ── STOCK ───────────────────────────────────────────────────────────
    sectionHeader(doc, C.navy, 'Stock');
    {
      const lowStock = data.stock.lowStock || [];
      const baseRows = 4;
      const alertRows = Math.min(lowStock.length, 6);
      const cardH = 20 * baseRows + (alertRows > 0 ? 20 * alertRows + 24 : 0) + 24;
      const { x, y } = cardStart(doc, cardH);
      let cy = y + 12;
      const innerX = x + 16;
      const innerW = CONTENT_W - 32;

      kvRow(doc, innerX, cy, innerW, 'Total produits', String(data.stock.totalProducts)); cy += 18;
      kvRow(doc, innerX, cy, innerW, 'Valeur totale du stock', formatFcfa(data.stock.totalStockValue)); cy += 18;
      kvRow(doc, innerX, cy, innerW, 'Alertes stock bas', String(data.stock.lowStock.length), { labelColor: C.warning, valueColor: C.warning, bold: true }); cy += 18;
      kvRow(doc, innerX, cy, innerW, 'Produits épuisés', String(data.stock.outOfStock.length), { labelColor: C.danger, valueColor: C.danger, bold: true }); cy += 18;

      if (alertRows > 0) {
        cy += 6;
        doc.save();
        doc.moveTo(innerX, cy).lineTo(innerX + innerW, cy).strokeColor(C.border).lineWidth(1).stroke();
        doc.restore();
        cy += 10;
        doc.fillColor(C.danger).font('Helvetica-Bold').fontSize(8)
          .text('PRODUITS EN ALERTE', innerX, cy, { characterSpacing: 0.5 });
        cy += 16;
        lowStock.slice(0, 6).forEach((p) => {
          doc.save();
          doc.circle(innerX + 3, cy + 4, 3).fill(C.danger);
          doc.restore();
          doc.fillColor(C.danger).font('Helvetica').fontSize(8.5)
            .text(p.name, innerX + 12, cy, { width: innerW * 0.6 - 12 });
          doc.fillColor(C.textLight).font('Helvetica').fontSize(8)
            .text(`Stock : ${p.stock} / Alerte : ${p.alert}`, innerX + innerW * 0.6, cy, { width: innerW * 0.4, align: 'right' });
          cy += 18;
        });
      }

      doc.y = y + cardH;
    }

    // ── DÉPENSES ────────────────────────────────────────────────────────
    sectionHeader(doc, C.danger, `Dépenses — ${formatFcfa(data.expenses.total)}`);
    {
      const entries = Object.entries(data.expenses.byCategory || {});
      if (entries.length === 0) {
        doc.fillColor(C.textLight).font('Helvetica').fontSize(9).text('Aucune dépense enregistrée.');
        doc.moveDown(0.5);
      } else {
        const maxAmount = Math.max(...entries.map(([, amt]) => amt), 1);
        const cardH = 22 * entries.length + 24;
        const { x, y } = cardStart(doc, cardH);
        let cy = y + 12;
        const innerX = x + 16;
        const innerW = CONTENT_W - 32;

        entries.forEach(([cat, amount]) => {
          doc.fillColor(C.text).font('Helvetica').fontSize(8.8)
            .text(cat, innerX, cy, { width: innerW * 0.32 });
          progressBar(doc, innerX + innerW * 0.34, cy + 1, innerW * 0.42, (amount / maxAmount) * 100, C.navy);
          doc.fillColor(C.textLight).font('Helvetica').fontSize(8.3)
            .text(formatFcfa(amount), innerX + innerW * 0.78, cy, { width: innerW * 0.22, align: 'right' });
          cy += 22;
        });

        doc.y = y + cardH;
      }
    }

    // ── PIED DE PAGE (sur toutes les pages) ───────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fillColor(C.textLight).font('Helvetica').fontSize(7.5)
        .text(
          `Rapport généré automatiquement — ${companyName} — Page ${i + 1}/${range.count}`,
          PAGE_MARGIN,
          doc.page.height - 30,
          { align: 'center', width: CONTENT_W }
        );
    }

    doc.end();
  });
}

module.exports = { buildReportPdf };