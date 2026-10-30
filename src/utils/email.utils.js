// ============================================================
// SonShop + SonTech — Templates Emails
// Thème dynamique selon storeCode
// ============================================================

// ── Thème SonShop (défaut) ────────────────────────────────────────────────────
const C_SONSHOP = {
  primary:   '#C8748A',
  gold:      '#C8A96E',
  navy:      '#2C2C3E',
  white:     '#FFFFFF',
  offWhite:  '#FDF8F5',
  cream:     '#FAF3EE',
  text:      '#2C2C3E',
  textLight: '#7A7585',
  border:    '#EDE4DC',
  bg:        '#F5EDE8',
  success:   '#2D6A4F',
  danger:    '#C0392B',
  warning:   '#856404',
  subtitle:  'Mode & Beauté',
};

// ── Thème SonTech ─────────────────────────────────────────────────────────────
const C_SONTECH = {
  primary:   '#2563EB',
  gold:      '#60A5FA',
  navy:      '#1E293B',
  white:     '#FFFFFF',
  offWhite:  '#F0F9FF',
  cream:     '#EFF6FF',
  text:      '#1E293B',
  textLight: '#64748B',
  border:    '#BFDBFE',
  bg:        '#EFF6FF',
  success:   '#2D6A4F',
  danger:    '#C0392B',
  warning:   '#856404',
  subtitle:  'Électronique & Tech',
};

function getTheme(storeCode) {
  return storeCode === 'SONTECH' ? C_SONTECH : C_SONSHOP;
}

// ── Layout commun ─────────────────────────────────────────────────────────────
function layout(bodyContent, preheader = '', storeName = 'SonShop', storeCode = 'SONSHOP') {
  const C = getTheme(storeCode);
  const displayName = storeName.toUpperCase();
  const [part1, part2] = displayName.startsWith('SON')
    ? ['SON', displayName.slice(3)]
    : [displayName, ''];

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${storeName}</title>
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;">${preheader}</div>` : ''}
</head>
<body style="margin:0;padding:0;background-color:${C.bg};font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- HEADER -->
        <tr>
          <td style="background:${C.navy};padding:28px 40px;border-radius:12px 12px 0 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="font-size:24px;font-weight:900;letter-spacing:3px;font-family:Georgia,serif;">
                    <span style="color:${C.primary};">${part1}</span><span style="color:${C.white};">${part2}</span>
                  </div>
                  <div style="font-size:9px;color:#aaaaaa;letter-spacing:3px;margin-top:4px;text-transform:uppercase;">
                    ${C.subtitle}
                  </div>
                </td>
                <td style="text-align:right;">
                  <div style="display:inline-block;background:${C.primary};border-radius:50%;width:10px;height:10px;margin-left:4px;opacity:0.6;"></div>
                  <div style="display:inline-block;background:${C.gold};border-radius:50%;width:10px;height:10px;margin-left:4px;opacity:0.8;"></div>
                  <div style="display:inline-block;background:${C.white};border-radius:50%;width:10px;height:10px;margin-left:4px;opacity:0.4;"></div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- BANDE COULEUR -->
        <tr><td style="background:linear-gradient(90deg,${C.primary},${C.gold});height:3px;font-size:0;">&nbsp;</td></tr>

        <!-- CORPS -->
        <tr>
          <td style="background:${C.white};padding:40px;border-left:1px solid ${C.border};border-right:1px solid ${C.border};">
            ${bodyContent}
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:${C.navy};padding:24px 40px;border-radius:0 0 12px 12px;text-align:center;">
            <p style="margin:0 0 8px;font-size:11px;color:#aaaaaa;">
              Des questions ? Contactez-nous via
              <a href="https://wa.me/221XXXXXXXXX" style="color:${C.primary};text-decoration:none;font-weight:600;">WhatsApp</a>
            </p>
            <p style="margin:0 0 8px;font-size:10px;color:#666666;">
              &copy; ${new Date().getFullYear()} ${storeName} &middot; Dakar, Sénégal
            </p>
            <table cellpadding="0" cellspacing="0" style="margin:12px auto 0;">
              <tr>
                <td style="padding:0 6px;">
                  <div style="width:24px;height:24px;background:rgba(255,255,255,0.1);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;">
                    <span style="color:${C.primary};font-size:12px;">f</span>
                  </div>
                </td>
                <td style="padding:0 6px;">
                  <div style="width:24px;height:24px;background:rgba(255,255,255,0.1);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;">
                    <span style="color:${C.primary};font-size:12px;">in</span>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Composants réutilisables ──────────────────────────────────────────────────

function badge(status) {
  const map = {
    CONFIRMED:  { label: 'Confirmée',       bg: '#e8f5e9', color: '#2D6A4F' },
    PROCESSING: { label: 'En préparation',  bg: '#fff3cd', color: '#856404' },
    SHIPPED:    { label: 'Expédiée',        bg: '#e3f2fd', color: '#0d47a1' },
    DELIVERED:  { label: 'Livrée ✓',       bg: '#e8f5e9', color: '#2D6A4F' },
    CANCELLED:  { label: 'Annulée',         bg: '#fce4e4', color: '#C0392B' },
    PENDING:    { label: 'En attente',      bg: '#fff3cd', color: '#856404' },
    DRAFT:      { label: 'Brouillon',       bg: '#f5f5f5', color: '#555'    },
    PAID:       { label: 'Payé',            bg: '#e8f5e9', color: '#2D6A4F' },
    REJECTED:   { label: 'Rejeté',          bg: '#fce4e4', color: '#C0392B' },
    PARTIAL:    { label: 'Partiel',         bg: '#fff3cd', color: '#856404' },
    GENERATED:  { label: 'Générée',         bg: '#e3f2fd', color: '#0d47a1' },
  };
  const s = map[status] || { label: status, bg: '#f5f5f5', color: '#555' };
  return `<span style="display:inline-block;padding:5px 16px;border-radius:20px;font-size:12px;font-weight:700;background:${s.bg};color:${s.color};">${s.label}</span>`;
}

function cta(text, url, primaryColor = '#C8748A') {
  return `
  <table cellpadding="0" cellspacing="0" style="margin:28px auto 0;">
    <tr>
      <td style="background:${primaryColor};border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.15);">
        <a href="${url}" style="display:block;padding:14px 36px;color:#ffffff;font-weight:700;font-size:13px;text-decoration:none;letter-spacing:1px;text-transform:uppercase;">
          ${text}
        </a>
      </td>
    </tr>
  </table>`;
}

function whatsappCta(number, storeName = 'SonShop') {
  if (!number) return '';
  return `
  <table cellpadding="0" cellspacing="0" style="margin:12px auto 0;">
    <tr>
      <td style="background:#25D366;border-radius:8px;">
        <a href="https://wa.me/${number}" style="display:block;padding:12px 28px;color:#ffffff;font-weight:700;font-size:13px;text-decoration:none;letter-spacing:1px;text-transform:uppercase;">
          💬 Contacter ${storeName} sur WhatsApp
        </a>
      </td>
    </tr>
  </table>`;
}

function divider(borderColor = '#EDE4DC') {
  return `<div style="border-top:1px solid ${borderColor};margin:24px 0;"></div>`;
}

function infoRow(label, value, C) {
  return `
  <tr>
    <td style="padding:8px 16px;font-size:12px;color:${C.textLight};width:38%;border-bottom:1px solid ${C.border};">${label}</td>
    <td style="padding:8px 16px;font-size:12px;font-weight:600;color:${C.text};border-bottom:1px solid ${C.border};">${value}</td>
  </tr>`;
}

function infoBox(rows, C) {
  const filtered = rows.filter(Boolean);
  if (!filtered.length) return '';
  return `
  <table width="100%" cellpadding="0" cellspacing="0"
    style="background:${C.offWhite};border-radius:8px;border:1px solid ${C.border};margin:20px 0;overflow:hidden;">
    ${filtered.map(([l, v]) => infoRow(l, v, C)).join('')}
  </table>`;
}

function productRow(item, C) {
  const variantParts = [];
  if (item.variantLabel) variantParts.push(item.variantLabel);

  const imageUrl = item.imageUrl
    || item.product?.images?.find(i => i.isMain)?.url
    || item.product?.images?.[0]?.url
    || null;

  return `
  <tr>
    <td style="padding:14px 0;border-bottom:1px solid ${C.border};">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          ${imageUrl ? `
          <td style="width:64px;vertical-align:top;padding-right:14px;">
            <img src="${imageUrl}" alt="${item.productName}"
              style="width:60px;height:60px;object-fit:cover;border-radius:8px;border:1px solid ${C.border};display:block;" />
          </td>` : ''}
          <td style="vertical-align:top;">
            <div style="font-size:13px;font-weight:700;color:${C.text};margin-bottom:4px;">
              ${item.productName}
            </div>
            ${variantParts.length > 0 ? `
            <div style="margin-bottom:4px;">
              <span style="display:inline-block;background:${C.offWhite};border:1px solid ${C.border};border-radius:4px;padding:2px 8px;font-size:11px;color:${C.textLight};">
                ${variantParts.join(' · ')}
              </span>
            </div>` : ''}
            <div style="font-size:11px;color:${C.textLight};">
              Quantité : <strong style="color:${C.text};">${item.quantity}</strong>
              &nbsp;·&nbsp;
              <span style="color:${C.textLight};">${Number(item.price).toLocaleString('fr-FR')} FCFA / unité</span>
            </div>
          </td>
          <td style="vertical-align:top;text-align:right;white-space:nowrap;padding-left:12px;">
            <div style="font-size:14px;font-weight:800;color:${C.navy};">
              ${Number(item.subtotal || item.price * item.quantity).toLocaleString('fr-FR')} FCFA
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function productRowCompact(item, C) {
  const imageUrl = item.imageUrl
    || item.product?.images?.find(i => i.isMain)?.url
    || item.product?.images?.[0]?.url
    || null;

  return `
  <tr>
    <td style="padding:10px 0;border-bottom:1px solid ${C.border};">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          ${imageUrl ? `
          <td style="width:48px;vertical-align:middle;padding-right:12px;">
            <img src="${imageUrl}" alt="${item.productName}"
              style="width:44px;height:44px;object-fit:cover;border-radius:6px;border:1px solid ${C.border};display:block;" />
          </td>` : ''}
          <td style="vertical-align:middle;">
            <div style="font-size:12px;font-weight:700;color:${C.text};">${item.productName}</div>
            ${item.variantLabel ? `<div style="font-size:10px;color:${C.textLight};margin-top:2px;">${item.variantLabel}</div>` : ''}
            <div style="font-size:10px;color:${C.textLight};margin-top:1px;">Qté : ${item.quantity}</div>
          </td>
          <td style="vertical-align:middle;text-align:right;white-space:nowrap;">
            <div style="font-size:12px;font-weight:700;color:${C.navy};">
              ${Number(item.subtotal || item.price * item.quantity).toLocaleString('fr-FR')} FCFA
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function itemsSummaryBlock(items = [], compact = false, C) {
  if (!items.length) return '';
  const rows = items.map(item => compact ? productRowCompact(item, C) : productRow(item, C)).join('');
  return `
  <div style="margin:20px 0;">
    <div style="font-size:11px;font-weight:700;color:${C.navy};text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">
      🛍️ Article${items.length > 1 ? 's' : ''} commandé${items.length > 1 ? 's' : ''} (${items.length})
    </div>
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:${C.offWhite};border-radius:8px;border:1px solid ${C.border};padding:0 16px;overflow:hidden;">
      ${rows}
    </table>
  </div>`;
}

function totalsBlock({ subtotal, shippingCost, discount, storeDiscount, tax, total }, C) {
  function row(label, value, bold = false, color = C.textLight) {
    return `
    <tr>
      <td style="padding:5px 0;font-size:13px;color:${C.textLight};">${label}</td>
      <td style="padding:5px 0;font-size:13px;font-weight:${bold ? '700' : '400'};color:${color};text-align:right;">${value}</td>
    </tr>`;
  }
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;border-top:2px solid ${C.navy};padding-top:14px;">
    ${row('Sous-total', `${Number(subtotal || 0).toLocaleString('fr-FR')} FCFA`)}
    ${Number(shippingCost)  > 0 ? row('Livraison', `${Number(shippingCost).toLocaleString('fr-FR')} FCFA`) : row('Livraison', 'À confirmer')}
    ${Number(discount)      > 0 ? row('Remise', `-${Number(discount).toLocaleString('fr-FR')} FCFA`, false, C.success) : ''}
    ${Number(storeDiscount) > 0 ? row('Remise boutique', `-${Number(storeDiscount).toLocaleString('fr-FR')} FCFA`, false, C.success) : ''}
    ${Number(tax)           > 0 ? row('Taxes', `${Number(tax).toLocaleString('fr-FR')} FCFA`) : ''}
    <tr>
      <td colspan="2" style="padding-top:10px;">
        <table width="100%" cellpadding="0" cellspacing="0"
          style="background:${C.navy};border-radius:8px;padding:14px 20px;">
          <tr>
            <td style="font-size:13px;font-weight:700;color:#ffffff;">TOTAL</td>
            <td style="font-size:18px;font-weight:900;color:${C.gold};text-align:right;">${Number(total || 0).toLocaleString('fr-FR')} FCFA</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

function greeting(name, C) {
  return `<p style="margin:0 0 20px;font-size:14px;color:${C.text};">
    Bonjour <strong>${name || 'cher(e) client(e)'}</strong>,
  </p>`;
}

function signature(storeName = 'SonShop', C) {
  return `<p style="margin:28px 0 0;font-size:13px;color:${C.textLight};">
    À bientôt,<br/>
    <strong style="color:${C.text};">L'équipe ${storeName}</strong>
  </p>`;
}

function guestInfoBanner(whatsappNumber, C) {
  return `
  <table width="100%" cellpadding="0" cellspacing="0"
    style="background:#fff8e1;border:1px solid #ffe082;border-radius:8px;margin:20px 0;">
    <tr>
      <td style="padding:14px 18px;">
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:${C.warning};">
          ℹ️ Commande passée sans compte
        </p>
        <p style="margin:0;font-size:12px;color:${C.warning};line-height:1.6;">
          Vous n'avez pas de compte. Pour suivre l'évolution de votre commande,
          contactez-nous directement sur WhatsApp en indiquant votre numéro de commande.
        </p>
        ${whatsappNumber ? `
        <p style="margin:10px 0 0;font-size:12px;color:${C.warning};">
          👉 <a href="https://wa.me/${whatsappNumber}" style="color:${C.warning};font-weight:700;">Suivre ma commande sur WhatsApp</a>
        </p>` : ''}
      </td>
    </tr>
  </table>`;
}

function kpiCard(emoji, label, value, subValue = '', color = '#C8748A') {
  const C = C_SONSHOP;
  return `
  <td style="width:25%;padding:8px;" valign="top">
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:${C.offWhite};border:1px solid ${C.border};border-radius:10px;overflow:hidden;">
      <tr>
        <td style="background:${color};padding:8px 12px;text-align:center;">
          <span style="font-size:20px;">${emoji}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px;text-align:center;">
          <div style="font-size:18px;font-weight:800;color:${C.text};">${value}</div>
          <div style="font-size:10px;color:${C.textLight};text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">${label}</div>
          ${subValue ? `<div style="font-size:10px;color:${color};font-weight:600;margin-top:4px;">${subValue}</div>` : ''}
        </td>
      </tr>
    </table>
  </td>`;
}

function progressBar(label, value, max, color = '#C8748A') {
  const C = C_SONSHOP;
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return `
  <tr>
    <td style="padding:6px 0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:12px;color:${C.text};width:45%;">${label}</td>
          <td style="width:40%;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#e8e4dc;border-radius:4px;height:8px;">
              <tr><td style="width:${pct}%;background:${color};border-radius:4px;height:8px;"></td><td></td></tr>
            </table>
          </td>
          <td style="font-size:11px;color:${C.textLight};text-align:right;width:15%;padding-left:8px;">${Number(value).toLocaleString('fr-FR')} FCFA</td>
        </tr>
      </table>
    </td>
  </tr>`;
}

// ============================================================
// 1. CONFIRMATION DE COMMANDE
// ============================================================
function buildOrderConfirmationEmail({
  orderNumber, guestName, total, clientUrl,
  items = [], shippingCost = 0, discount = 0, storeDiscount = 0,
  tax = 0, subtotal, paymentMethod, shippingAddress,
  isGuest = false, whatsappNumber = '',
  storeName = 'SonShop', storeCode = 'SONSHOP',
}) {
  const C = getTheme(storeCode);
  const name   = guestName || 'cher(e) client(e)';
  const sub    = subtotal ?? total;
  const addrLine = shippingAddress
    ? [shippingAddress.street, shippingAddress.city, shippingAddress.country].filter(Boolean).join(', ')
    : null;

  const payLabels = {
    CASH_ON_DELIVERY: 'Paiement à la livraison',
    MOBILE_MONEY:     'Mobile Money',
  };

  const itemsSummary = items.length > 0
    ? items.map(i => `${i.productName}${i.variantLabel ? ` (${i.variantLabel})` : ''} ×${i.quantity}`).join(', ')
    : null;

  const body = `
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:800;color:${C.navy};">
      Commande confirmée 🎉
    </h1>
    <p style="margin:0 0 24px;font-size:14px;color:${C.textLight};">
      Merci <strong style="color:${C.text};">${name}</strong>, votre commande a bien été reçue et est en cours de traitement.
    </p>

    ${infoBox([
      ['N° commande',   `<strong style="font-size:14px;color:${C.primary};">${orderNumber}</strong>`],
      ['Client(e)',     name],
      addrLine        ? ['Adresse de livraison', addrLine] : null,
      paymentMethod   ? ['Mode de paiement', payLabels[paymentMethod] || paymentMethod] : null,
      itemsSummary    ? ['Résumé', `<span style="font-size:11px;color:${C.textLight};">${itemsSummary}</span>`] : null,
    ], C)}

    ${itemsSummaryBlock(items, false, C)}
    ${totalsBlock({ subtotal: sub, shippingCost, discount, storeDiscount, tax, total }, C)}
    ${divider(C.border)}

    <p style="margin:0;font-size:13px;color:${C.text};line-height:1.6;">
      Nous préparons votre commande avec soin. Vous serez notifié(e) par email à chaque étape de livraison.
    </p>

    ${isGuest
      ? guestInfoBanner(whatsappNumber, C)
      : cta('Suivre ma commande', `${clientUrl}/suivi/${orderNumber}`, C.primary)
    }

    ${signature(storeName, C)}
  `;

  return {
    subject: `✅ Commande ${orderNumber} confirmée — ${storeName}`,
    html: layout(body, `Votre commande ${orderNumber} est confirmée.`, storeName, storeCode),
  };
}

// ============================================================
// 2. MISE À JOUR STATUT
// ============================================================
function buildOrderStatusEmail({
  orderNumber, customerName, status, clientUrl,
  trackingNote, isGuest = false, whatsappNumber = '',
  items = [], total, shippingAddress,
  storeName = 'SonShop', storeCode = 'SONSHOP',
}) {
  const C = getTheme(storeCode);

  const config = {
    CONFIRMED:  { emoji: '✅', label: 'confirmée',               msg: 'Votre commande a été confirmée et va bientôt être préparée.' },
    PROCESSING: { emoji: '📦', label: 'en cours de préparation', msg: 'Notre équipe prépare votre commande avec soin.' },
    SHIPPED:    { emoji: '🚚', label: 'expédiée',                msg: 'Votre commande est en route ! Notre livreur vous contactera sous peu.' },
    DELIVERED:  { emoji: '🎁', label: 'livrée',                  msg: 'Votre commande a été livrée avec succès. Merci pour votre confiance !' },
    CANCELLED:  { emoji: '❌', label: 'annulée',                 msg: 'Votre commande a été annulée. Contactez-nous si vous avez des questions.' },
    PENDING:    { emoji: '⏳', label: 'en attente',              msg: 'Votre commande est en attente de confirmation.' },
  };

  const s = config[status] || { emoji: '📋', label: status, msg: '' };

  const addrLine = shippingAddress
    ? [shippingAddress.street, shippingAddress.city, shippingAddress.country].filter(Boolean).join(', ')
    : null;

  const body = `
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:800;color:${C.navy};">
      ${s.emoji} Commande ${s.label}
    </h1>

    ${greeting(customerName, C)}

    ${infoBox([
      ['N° commande', `<strong style="color:${C.primary};">${orderNumber}</strong>`],
      ['Statut',      badge(status)],
      addrLine      ? ['Livraison', addrLine] : null,
      total != null ? ['Total', `<strong style="color:${C.navy};">${Number(total).toLocaleString('fr-FR')} FCFA</strong>`] : null,
    ], C)}

    <p style="margin:0 0 16px;font-size:14px;color:${C.text};line-height:1.6;">${s.msg}</p>

    ${trackingNote ? `
    <div style="background:${C.offWhite};border-left:3px solid ${C.primary};padding:12px 16px;margin:0 0 16px;border-radius:0 8px 8px 0;">
      <p style="margin:0;font-size:13px;color:${C.textLight};font-style:italic;">${trackingNote}</p>
    </div>` : ''}

    ${items.length > 0 ? itemsSummaryBlock(items, true, C) : ''}
    ${divider(C.border)}

    ${isGuest ? `
    <p style="margin:0 0 8px;font-size:13px;color:${C.text};">
      Pour suivre votre commande, contactez-nous en précisant le numéro : <strong>${orderNumber}</strong>
    </p>
    ${whatsappCta(whatsappNumber, storeName)}
    ` : (status !== 'CANCELLED'
      ? cta('Voir ma commande', `${clientUrl}/suivi/${orderNumber}`, C.primary)
      : whatsappCta(whatsappNumber, storeName)
    )}

    ${signature(storeName, C)}
  `;

  return {
    subject: `Commande ${orderNumber} — ${s.label} ${s.emoji} — ${storeName}`,
    html: layout(body, `Votre commande ${orderNumber} est ${s.label}.`, storeName, storeCode),
  };
}

// ============================================================
// 3. FACTURE PAR EMAIL
// ============================================================
function buildInvoiceEmail({
  invoiceNumber, orderNumber, customerName, total, clientUrl,
  storeName = 'SonShop', storeCode = 'SONSHOP',
}) {
  const C = getTheme(storeCode);

  const body = `
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:800;color:${C.navy};">
      Votre facture est disponible
    </h1>

    ${greeting(customerName, C)}

    <p style="margin:0 0 20px;font-size:14px;color:${C.text};line-height:1.6;">
      Veuillez trouver en pièce jointe la facture <strong>${invoiceNumber}</strong>
      relative à votre commande <strong>${orderNumber}</strong>.
    </p>

    ${infoBox([
      ['N° facture',  invoiceNumber],
      ['N° commande', orderNumber],
      ['Montant',     `<strong style="color:${C.primary};">${Number(total || 0).toLocaleString('fr-FR')} FCFA</strong>`],
    ], C)}

    ${cta('Télécharger ma facture', `${clientUrl}/invoices/${invoiceNumber}/pdf`, C.primary)}
    ${signature(storeName, C)}
  `;

  return {
    subject: `Facture ${invoiceNumber} — ${storeName}`,
    html: layout(body, `Votre facture ${invoiceNumber} est disponible.`, storeName, storeCode),
  };
}

// ============================================================
// 4. RÉINITIALISATION MOT DE PASSE
// ============================================================
function buildPasswordResetEmail({ name, resetUrl, storeName = 'SonShop', storeCode = 'SONSHOP' }) {
  const C = getTheme(storeCode);

  const body = `
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:800;color:${C.navy};">
      Réinitialisation du mot de passe
    </h1>

    ${greeting(name, C)}

    <p style="margin:0 0 20px;font-size:14px;color:${C.text};line-height:1.6;">
      Nous avons reçu une demande de réinitialisation de votre mot de passe.
      Cliquez sur le bouton ci-dessous pour en définir un nouveau.
    </p>

    ${cta('Réinitialiser mon mot de passe', resetUrl, C.primary)}
    ${divider(C.border)}

    <p style="margin:0;font-size:12px;color:${C.textLight};line-height:1.6;">
      Ce lien expire dans <strong>1 heure</strong>. Si vous n'avez pas demandé
      cette réinitialisation, ignorez simplement cet email.
    </p>

    ${signature(storeName, C)}
  `;

  return {
    subject: `Réinitialisation de votre mot de passe — ${storeName}`,
    html: layout(body, '', storeName, storeCode),
  };
}

// ============================================================
// 5. PRÉCOMMANDE (article en rupture)
// ============================================================
function buildPreorderEmail({ name, productName, orderNumber, storeName = 'SonShop', storeCode = 'SONSHOP' }) {
  const C = getTheme(storeCode);

  const body = `
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:800;color:${C.navy};">
      Précommande enregistrée
    </h1>

    ${greeting(name, C)}

    <p style="margin:0 0 20px;font-size:14px;color:${C.text};line-height:1.6;">
      Votre demande de précommande pour <strong>${productName}</strong> a bien été prise en compte.
      Nous vous contacterons dès que l'article sera de nouveau disponible.
    </p>

    ${infoBox([
      ['Produit',   productName],
      ['Référence', orderNumber || '—'],
      ['Statut',    badge('PENDING')],
    ], C)}

    <p style="margin:20px 0 0;font-size:13px;color:${C.textLight};line-height:1.6;">
      Pour toute question, n'hésitez pas à nous contacter via WhatsApp.
    </p>

    ${signature(storeName, C)}
  `;

  return {
    subject: `Précommande confirmée — ${productName} — ${storeName}`,
    html: layout(body, '', storeName, storeCode),
  };
}

// ============================================================
// 6. RAPPORT DE GESTION
// ============================================================
function buildReportEmail({ period, financial, orders, products, stock, expenses, storeName = 'SonShop', storeCode = 'SONSHOP' }) {
  const C = getTheme(storeCode);
  const fmt = (n) => Number(n || 0).toLocaleString('fr-FR');
  const pct = (val, total) => total > 0 ? Math.round((val / total) * 100) : 0;

  const beneficePositif = financial.beneficeEstime >= 0;
  const beneficeColor   = beneficePositif ? C.success : C.danger;
  const beneficeEmoji   = beneficePositif ? '📈' : '📉';

  const kpiSection = `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      ${kpiCard('💰', "Chiffre d'affaires", `${fmt(financial.chiffreAffaires)} FCFA`, '', C.primary)}
      ${kpiCard(beneficeEmoji, 'Bénéfice estimé', `${fmt(financial.beneficeEstime)} FCFA`, '', beneficeColor)}
      ${kpiCard('🛍️', 'Commandes', String(orders.total), '', C.navy)}
      ${kpiCard('📄', 'Facturé', `${fmt(financial.totalInvoiced)} FCFA`, '', C.gold)}
    </tr>
  </table>`;

  const statusLabels = {
    PENDING: 'En attente', CONFIRMED: 'Confirmées', PROCESSING: 'En préparation',
    SHIPPED: 'Expédiées', DELIVERED: 'Livrées', CANCELLED: 'Annulées', DRAFT: 'Brouillons',
  };
  const statusColors = {
    PENDING: C.warning, CONFIRMED: '#0d47a1', PROCESSING: C.gold,
    SHIPPED: '#1565c0', DELIVERED: C.success, CANCELLED: C.danger, DRAFT: '#888',
  };
  const statusRows = Object.entries(orders.byStatus || {}).map(([status, count]) => {
    const pctVal = pct(count, orders.total);
    const color = statusColors[status] || C.primary;
    return `
    <tr>
      <td style="padding:5px 0;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:12px;color:${C.text};width:38%;">${statusLabels[status] || status}</td>
            <td style="width:42%;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:${pctVal}%;background:${color};height:8px;border-radius:4px;"></td>
                  <td style="background:#e8e4dc;height:8px;border-radius:${pctVal > 0 ? '0' : '4px'} 4px 4px ${pctVal > 0 ? '0' : '4px'};"></td>
                </tr>
              </table>
            </td>
            <td style="font-size:12px;color:${C.textLight};text-align:right;padding-left:8px;width:20%;">${count} (${pctVal}%)</td>
          </tr>
        </table>
      </td>
    </tr>`;
  }).join('');

  const topCA = (orders.topClients || [])[0]?.total || 1;
  const topClientsRows = (orders.topClients || []).slice(0, 5).map((c, i) => {
    const pctVal = pct(c.total, topCA);
    return `
    <tr>
      <td style="padding:5px 0;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="width:28px;text-align:center;">
              <span style="display:inline-block;width:20px;height:20px;background:${i === 0 ? C.gold : C.border};border-radius:50%;font-size:10px;font-weight:700;color:${i === 0 ? '#fff' : C.textLight};text-align:center;line-height:20px;">${i + 1}</span>
            </td>
            <td style="font-size:12px;color:${C.text};padding:0 8px;">${c.name}<span style="color:${C.textLight};font-size:10px;margin-left:4px;">${c.count} cmd</span></td>
            <td style="font-size:11px;color:${C.primary};font-weight:700;text-align:right;white-space:nowrap;">${fmt(c.total)} FCFA</td>
          </tr>
          <tr>
            <td></td>
            <td colspan="2" style="padding-bottom:4px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:${pctVal}%;background:${C.primary};height:3px;border-radius:2px;opacity:0.4;"></td>
                  <td style="background:${C.border};height:3px;"></td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
  }).join('');

  const topRevenue = (products.topProducts || [])[0]?.revenue || 1;
  const topProduitsRows = (products.topProducts || []).slice(0, 5).map((p) => `
    <tr>
      <td style="padding:5px 0;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:12px;color:${C.text};width:50%;">${p.name}</td>
            <td style="font-size:11px;color:${C.textLight};text-align:center;width:20%;">${p.quantity} unités</td>
            <td style="font-size:11px;color:${C.primary};font-weight:700;text-align:right;width:30%;white-space:nowrap;">${fmt(p.revenue)} FCFA</td>
          </tr>
          <tr>
            <td colspan="3" style="padding:2px 0 4px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:${pct(p.revenue, topRevenue)}%;background:${C.gold};height:3px;border-radius:2px;"></td>
                  <td style="background:${C.border};height:3px;"></td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`).join('');

  const stockAlertRows = (stock.lowStock || []).slice(0, 5).map(p => `
    <tr>
      <td style="padding:4px 0;font-size:12px;color:${C.danger};">⚠️ ${p.name}</td>
      <td style="padding:4px 0;font-size:11px;color:${C.textLight};text-align:right;">Stock : ${p.stock} / Alerte : ${p.alert}</td>
    </tr>`).join('');

  const topDepense = Math.max(...Object.values(expenses.byCategory || {}), 1);
  const depenseRows = Object.entries(expenses.byCategory || {}).map(([cat, amount]) =>
    progressBar(cat, amount, topDepense, C.navy)
  ).join('');

  const body = `
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <h1 style="margin:0 0 4px;font-size:20px;font-weight:800;color:${C.navy};">Rapport de gestion</h1>
          <p style="margin:0;font-size:13px;color:${C.textLight};">${storeName}</p>
        </td>
        <td style="text-align:right;vertical-align:top;">
          <div style="display:inline-block;background:${C.offWhite};border:1px solid ${C.border};border-radius:8px;padding:8px 14px;">
            <div style="font-size:10px;color:${C.textLight};text-transform:uppercase;letter-spacing:0.5px;">Période</div>
            <div style="font-size:12px;font-weight:700;color:${C.navy};margin-top:2px;">${period.from} → ${period.to}</div>
          </div>
        </td>
      </tr>
    </table>

    ${kpiSection}

    <div style="background:${C.offWhite};border:1px solid ${C.border};border-radius:10px;padding:16px;margin:0 0 20px;">
      <div style="font-size:11px;font-weight:700;color:${C.navy};text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">📊 Équilibre financier</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${progressBar("Chiffre d'affaires", financial.chiffreAffaires, financial.chiffreAffaires, C.primary)}
        ${progressBar('Coût des ventes (COGS)', financial.cogs, financial.chiffreAffaires, C.navy)}
        ${progressBar('Dépenses', financial.totalExpenses, financial.chiffreAffaires, C.danger)}
      </table>
      <div style="margin-top:12px;padding:10px 14px;background:${beneficePositif ? '#e8f5e9' : '#fce4e4'};border-radius:8px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:13px;font-weight:700;color:${beneficeColor};">${beneficeEmoji} Bénéfice estimé</td>
            <td style="font-size:16px;font-weight:900;color:${beneficeColor};text-align:right;">${fmt(financial.beneficeEstime)} FCFA</td>
          </tr>
        </table>
      </div>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr valign="top">
        <td width="48%" style="padding-right:8px;">
          <div style="background:${C.offWhite};border:1px solid ${C.border};border-radius:10px;padding:16px;">
            <div style="font-size:11px;font-weight:700;color:${C.navy};text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">🛍️ Commandes par statut</div>
            <table width="100%" cellpadding="0" cellspacing="0">${statusRows}</table>
          </div>
        </td>
        <td width="4%"></td>
        <td width="48%" style="padding-left:8px;">
          <div style="background:${C.offWhite};border:1px solid ${C.border};border-radius:10px;padding:16px;">
            <div style="font-size:11px;font-weight:700;color:${C.navy};text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">🏆 Top 5 clients</div>
            <table width="100%" cellpadding="0" cellspacing="0">${topClientsRows || '<tr><td style="font-size:12px;color:#aaa;">Aucune donnée</td></tr>'}</table>
          </div>
        </td>
      </tr>
    </table>

    <div style="background:${C.offWhite};border:1px solid ${C.border};border-radius:10px;padding:16px;margin-bottom:20px;">
      <div style="font-size:11px;font-weight:700;color:${C.navy};text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">💎 Top 5 produits vendus</div>
      <table width="100%" cellpadding="0" cellspacing="0">${topProduitsRows || '<tr><td style="font-size:12px;color:#aaa;">Aucune vente livrée sur la période</td></tr>'}</table>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr valign="top">
        <td width="48%" style="padding-right:8px;">
          <div style="background:${C.offWhite};border:1px solid ${C.border};border-radius:10px;padding:16px;">
            <div style="font-size:11px;font-weight:700;color:${C.navy};text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">📦 Stock</div>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="font-size:12px;color:${C.text};padding:4px 0;">Total produits</td><td style="font-size:12px;font-weight:700;color:${C.navy};text-align:right;">${stock.totalProducts}</td></tr>
              <tr><td style="font-size:12px;color:${C.text};padding:4px 0;">Valeur totale</td><td style="font-size:12px;font-weight:700;color:${C.navy};text-align:right;">${fmt(stock.totalStockValue)} FCFA</td></tr>
              <tr><td style="font-size:12px;color:${C.warning};padding:4px 0;">⚠️ Alertes stock bas</td><td style="font-size:12px;font-weight:700;color:${C.warning};text-align:right;">${stock.lowStock?.length || 0}</td></tr>
              <tr><td style="font-size:12px;color:${C.danger};padding:4px 0;">❌ Épuisés</td><td style="font-size:12px;font-weight:700;color:${C.danger};text-align:right;">${stock.outOfStock?.length || 0}</td></tr>
            </table>
            ${stockAlertRows ? `
            <div style="border-top:1px solid ${C.border};margin:24px 0;"></div>
            <div style="font-size:10px;font-weight:700;color:${C.danger};text-transform:uppercase;margin-bottom:6px;">Alertes</div>
            <table width="100%" cellpadding="0" cellspacing="0">${stockAlertRows}</table>` : ''}
          </div>
        </td>
        <td width="4%"></td>
        <td width="48%" style="padding-left:8px;">
          <div style="background:${C.offWhite};border:1px solid ${C.border};border-radius:10px;padding:16px;">
            <div style="font-size:11px;font-weight:700;color:${C.navy};text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">💸 Dépenses — ${fmt(expenses.total)} FCFA</div>
            <table width="100%" cellpadding="0" cellspacing="0">${depenseRows || '<tr><td style="font-size:12px;color:#aaa;">Aucune dépense enregistrée</td></tr>'}</table>
          </div>
        </td>
      </tr>
    </table>

    <div style="border-top:1px solid ${C.border};margin:24px 0;"></div>
    <p style="margin:0;font-size:11px;color:${C.textLight};text-align:center;line-height:1.6;">
      Rapport généré automatiquement le ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
    </p>
  `;

  return {
    subject: `📊 Rapport de gestion — ${period.from} au ${period.to} — ${storeName}`,
    html: layout(body, `Rapport de gestion du ${period.from} au ${period.to}`, storeName, storeCode),
  };
}

// ============================================================
// 7. EMAIL OTP — VÉRIFICATION / RÉINITIALISATION
// ============================================================
function buildOtpEmail({ code, type = 'REGISTER', expiresInMinutes = 15, storeName = 'SonShop', storeCode = 'SONSHOP' }) {
  const C = getTheme(storeCode);

  const isRegister = type === 'REGISTER';
  const title    = isRegister ? 'Confirmation de votre adresse email' : 'Code de réinitialisation';
  const subtitle = isRegister
    ? 'Entrez ce code pour finaliser la création de votre compte.'
    : 'Entrez ce code pour réinitialiser votre mot de passe.';

  const body = `
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:800;color:${C.navy};">
      ${title}
    </h1>

    <p style="margin:0 0 28px;font-size:14px;color:${C.textLight};">
      ${subtitle}
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
      <tr>
        <td align="center">
          <div style="
            display:inline-block;
            background:${C.offWhite};
            border:2px solid ${C.primary};
            border-radius:12px;
            padding:24px 40px;
            text-align:center;
          ">
            <div style="font-size:11px;color:${C.textLight};text-transform:uppercase;letter-spacing:2px;margin-bottom:12px;">
              Votre code
            </div>
            <div style="
              font-size:36px;
              font-weight:900;
              color:${C.navy};
              letter-spacing:10px;
              font-family:'Courier New', monospace;
            ">
              ${code}
            </div>
          </div>
        </td>
      </tr>
    </table>

    ${divider(C.border)}

    <p style="margin:0;font-size:12px;color:${C.textLight};line-height:1.7;text-align:center;">
      ⏱️ Ce code expire dans <strong>${expiresInMinutes} minutes</strong>.<br/>
      Si vous n'avez pas effectué cette demande, ignorez simplement cet email.
    </p>

    ${signature(storeName, C)}
  `;

  return {
    subject: isRegister
      ? `${code} — Votre code de vérification ${storeName}`
      : `${code} — Réinitialisation de mot de passe ${storeName}`,
    html: layout(body, title, storeName, storeCode),
  };
}

// ============================================================
// 8. ALERTE STOCK BAS / RUPTURE — envoyée par le job quotidien
// ============================================================
function buildStockAlertEmail({ lowStock = [], outOfStock = [], storeName = 'SonShop', storeCode = 'SONSHOP', adminUrl = '' }) {
  const C = getTheme(storeCode);

  const outOfStockRows = outOfStock.map((p) => `
    <tr>
      <td style="padding:6px 0;font-size:12px;color:${C.danger};font-weight:700;">❌ ${p.name}</td>
      <td style="padding:6px 0;font-size:11px;color:${C.textLight};text-align:right;">${p.store || 'Toutes boutiques'}</td>
    </tr>`).join('');

  const lowStockRows = lowStock.map((p) => `
    <tr>
      <td style="padding:6px 0;font-size:12px;color:${C.warning};font-weight:600;">⚠️ ${p.name}</td>
      <td style="padding:6px 0;font-size:11px;color:${C.textLight};text-align:right;">Stock : ${p.stock} / Alerte : ${p.alert} — ${p.store || 'Toutes boutiques'}</td>
    </tr>`).join('');

  const body = `
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:800;color:${C.navy};">
      🔔 Alerte stock
    </h1>
    <p style="margin:0 0 24px;font-size:14px;color:${C.textLight};">
      Voici les produits qui nécessitent votre attention aujourd'hui.
    </p>

    ${infoBox([
      outOfStock.length > 0 ? ['Produits épuisés', `<strong style="color:${C.danger};">${outOfStock.length}</strong>`] : null,
      lowStock.length > 0 ? ['Alertes stock bas', `<strong style="color:${C.warning};">${lowStock.length}</strong>`] : null,
    ], C)}

    ${outOfStock.length > 0 ? `
    <div style="margin:20px 0;">
      <div style="font-size:11px;font-weight:700;color:${C.danger};text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">
        Produits épuisés (${outOfStock.length})
      </div>
      <table width="100%" cellpadding="0" cellspacing="0"
        style="background:${C.offWhite};border-radius:8px;border:1px solid ${C.border};padding:4px 16px;">
        ${outOfStockRows}
      </table>
    </div>` : ''}

    ${lowStock.length > 0 ? `
    <div style="margin:20px 0;">
      <div style="font-size:11px;font-weight:700;color:${C.warning};text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">
        Stock bas (${lowStock.length})
      </div>
      <table width="100%" cellpadding="0" cellspacing="0"
        style="background:${C.offWhite};border-radius:8px;border:1px solid ${C.border};padding:4px 16px;">
        ${lowStockRows}
      </table>
    </div>` : ''}

    ${divider(C.border)}

    ${adminUrl ? cta('Gérer les produits', adminUrl, C.primary) : ''}

    <p style="margin:20px 0 0;font-size:11px;color:${C.textLight};text-align:center;line-height:1.6;">
      Alerte générée automatiquement le ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
    </p>

    ${signature(storeName, C)}
  `;

  return {
    subject: `🔔 Alerte stock — ${outOfStock.length} épuisé(s), ${lowStock.length} bas — ${storeName}`,
    html: layout(body, `${outOfStock.length + lowStock.length} produit(s) nécessitent votre attention`, storeName, storeCode),
  };
}
// ============================================================
// 9. NOTIFICATION ADMIN — NOUVELLE COMMANDE (avec fournisseurs)
// ============================================================
function buildAdminNewOrderEmail({
  orderNumber, guestName, total, items = [], shippingAddress,
  paymentMethod, adminUrl = '', storeName = 'SonShop', storeCode = 'SONSHOP',
}) {
  const C = getTheme(storeCode);
  const addrLine = shippingAddress
    ? [shippingAddress.street, shippingAddress.city, shippingAddress.country].filter(Boolean).join(', ')
    : null;

  const payLabels = {
    CASH_ON_DELIVERY: 'Paiement à la livraison',
    MOBILE_MONEY:     'Mobile Money',
  };

  // Regroupe les fournisseurs uniques concernés par cette commande
  const supplierMap = new Map();
  items.forEach((i) => {
    if (i.supplier) supplierMap.set(i.supplier.id, i.supplier);
  });
  const suppliers = [...supplierMap.values()];

  const itemsRows = items.map((i) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid ${C.border};">
        <div style="font-size:13px;font-weight:700;color:${C.text};">
          ${i.productName}${i.variantLabel ? ` (${i.variantLabel})` : ''} × ${i.quantity}
        </div>
        ${i.supplier ? `
        <div style="font-size:11px;color:${C.textLight};margin-top:3px;">
          📦 Fournisseur : <strong style="color:${C.text};">${i.supplier.name}</strong>${i.supplier.phone ? ` — <a href="tel:${i.supplier.phone}" style="color:${C.primary};text-decoration:none;">${i.supplier.phone}</a>` : ' (téléphone non renseigné)'}
        </div>` : `
        <div style="font-size:11px;color:${C.textLight};margin-top:3px;">Aucun fournisseur assigné à ce produit</div>`}
      </td>
    </tr>`).join('');

  const suppliersBlock = suppliers.length > 0 ? `
    <div style="margin:20px 0;background:${C.offWhite};border:1px solid ${C.border};border-radius:8px;padding:14px 16px;">
      <div style="font-size:11px;font-weight:700;color:${C.navy};text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">
        📞 Fournisseur(s) à contacter pour cette commande
      </div>
      ${suppliers.map((s) => `
        <p style="margin:0 0 8px;font-size:13px;color:${C.text};">
          <strong>${s.name}</strong>${s.phone ? ` — <a href="tel:${s.phone}" style="color:${C.primary};font-weight:700;text-decoration:none;">${s.phone}</a>` : ' <span style="color:' + C.warning + ';">(téléphone non renseigné)</span>'}
        </p>`).join('')}
    </div>` : `
    <div style="margin:20px 0;background:${C.offWhite};border:1px solid ${C.border};border-radius:8px;padding:14px 16px;">
      <p style="margin:0;font-size:12px;color:${C.textLight};">Aucun fournisseur n'est assigné aux produits de cette commande.</p>
    </div>`;

  const body = `
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:800;color:${C.navy};">
      🛍️ Nouvelle commande reçue
    </h1>
    <p style="margin:0 0 20px;font-size:14px;color:${C.textLight};">
      Commande <strong style="color:${C.primary};">${orderNumber}</strong> — à traiter.
    </p>

    ${infoBox([
      ['Client(e)', guestName || '—'],
      addrLine ? ['Adresse de livraison', addrLine] : null,
      paymentMethod ? ['Mode de paiement', payLabels[paymentMethod] || paymentMethod] : null,
      ['Total', `<strong style="color:${C.primary};">${Number(total).toLocaleString('fr-FR')} FCFA</strong>`],
    ], C)}

    <div style="margin:20px 0;">
      <div style="font-size:11px;font-weight:700;color:${C.navy};text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">
        Articles commandés (${items.length})
      </div>
      <table width="100%" cellpadding="0" cellspacing="0"
        style="background:${C.offWhite};border-radius:8px;border:1px solid ${C.border};padding:0 16px;overflow:hidden;">
        ${itemsRows}
      </table>
    </div>

    ${suppliersBlock}
    ${divider(C.border)}

    ${adminUrl ? cta('Voir la commande', adminUrl, C.primary) : ''}

    <p style="margin:20px 0 0;font-size:11px;color:${C.textLight};text-align:center;">
      Email interne — ne jamais transférer au client.
    </p>
  `;

  return {
    subject: `🛍️ [Admin] Nouvelle commande ${orderNumber} — ${storeName}`,
    html: layout(body, `Nouvelle commande ${orderNumber} — ${Number(total).toLocaleString('fr-FR')} FCFA`, storeName, storeCode),
  };
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  buildOrderConfirmationEmail,
  buildOrderStatusEmail,
  buildInvoiceEmail,
  buildPasswordResetEmail,
  buildPreorderEmail,
  buildReportEmail,
  buildOtpEmail,
  buildStockAlertEmail,
  buildAdminNewOrderEmail,   // ← ajouté
};