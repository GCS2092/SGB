const XLSX = require('xlsx');

function formatDateFr(date) {
  return new Date(date).toLocaleDateString('fr-FR');
}

function clientLabel(order) {
  if (!order) return '';
  if (order.user) {
    return `${order.user.firstName} ${order.user.lastName}`.trim();
  }
  return order.guestName || '';
}

function clientEmail(order) {
  if (!order) return '';
  return order.user?.email || order.guestEmail || '';
}

function buildInvoiceRows(invoices) {
  return invoices.map((inv) => ({
    'N° Facture': inv.invoiceNumber,
    'N° Commande': inv.order?.orderNumber || '',
    Client: clientLabel(inv.order),
    Email: clientEmail(inv.order),
    Date: formatDateFr(inv.issuedAt),
    'Sous-total (FCFA)': inv.subtotal,
    'Livraison (FCFA)': inv.shippingCost,
    'Remise (FCFA)': inv.discount,
    'Taxes (FCFA)': inv.tax,
    'Total (FCFA)': inv.total,
    Statut: inv.status,
    'Paiement commande': inv.order?.paymentStatus || '',
  }));
}

function buildWorkbookBuffer(invoices) {
  const rows = buildInvoiceRows(invoices);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 16 },
    { wch: 14 },
    { wch: 22 },
    { wch: 26 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 12 },
    { wch: 16 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Factures');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { buildWorkbookBuffer, buildInvoiceRows };
