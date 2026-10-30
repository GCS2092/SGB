const FREE_SHIPPING_ITEM_THRESHOLD = 5;

const DESTINATION_LABELS = {
  SENEGAL: 'Sénégal (Dakar)',
  CONGO_EXPRESS: 'Congo — Express',
  CONGO_GROUPAGE: 'Congo — Groupage',
};

function getShippingCost(destination, settings, { itemCount = 0, subtotal = 0 } = {}) {
  if (!destination || destination === 'SENEGAL') {
    const fee = Number(settings?.delivery_fee || 2000);
    const threshold = Number(settings?.free_delivery_threshold || 50000);
    if (subtotal >= threshold) return 0;
    return fee;
  }

  if (itemCount >= FREE_SHIPPING_ITEM_THRESHOLD) return 0;

  if (destination === 'CONGO_EXPRESS') return 0;

  if (destination === 'CONGO_GROUPAGE') {
    return Number(settings?.congo_groupage_rate || 8000);
  }

  return 0;
}

function getShippingDisplayText(destination, shippingCost) {
  if (destination === 'CONGO_EXPRESS') {
    return 'Nous contacter pour en savoir plus';
  }

  if (shippingCost === 0) {
    if (destination === 'SENEGAL') return 'Gratuite';
    if (destination === 'CONGO_GROUPAGE') return 'Gratuite';
    return 'Gratuite';
  }

  return `${Number(shippingCost).toLocaleString('fr-FR')} FCFA`;
}

function getDestinationLabel(destination) {
  return DESTINATION_LABELS[destination] || destination || '';
}

function computeOrderTotal(subtotal, shippingCost, discount = 0, storeDiscount = 0) {
  return subtotal + shippingCost - discount - storeDiscount;
}

module.exports = {
  FREE_SHIPPING_ITEM_THRESHOLD,
  DESTINATION_LABELS,
  getShippingCost,
  getShippingDisplayText,
  getDestinationLabel,
  computeOrderTotal,
};
