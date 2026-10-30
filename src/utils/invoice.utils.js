async function nextInvoiceNumber(tx, store) {
  const year = new Date().getFullYear();
  const storeId = store.id;
  const code = store.code || 'UBT';

  const seq = await tx.invoiceSequence.upsert({
    where: { storeId_year: { storeId, year } },
    create: { storeId, year, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });

  const number = seq.lastNumber;
  return `FA-${code}-${year}-${String(number).padStart(4, '0')}`;
}

async function nextCreditNoteNumber(tx, store) {
  const year = new Date().getFullYear();
  const code = store.code || 'UBT';

  const key = `credit_${store.id}_${year}`;
  const setting = await tx.setting.findUnique({ where: { key } });
  const next = setting ? Number(setting.value) + 1 : 1;

  await tx.setting.upsert({
    where: { key },
    create: { key, value: String(next) },
    update: { value: String(next) },
  });

  return `AV-${code}-${year}-${String(next).padStart(4, '0')}`;
}

async function nextTransferNumber(tx) {
  const year = new Date().getFullYear();
  const key = `transfer_seq_${year}`;
  const setting = await tx.setting.findUnique({ where: { key } });
  const next = setting ? Number(setting.value) + 1 : 1;

  await tx.setting.upsert({
    where: { key },
    create: { key, value: String(next) },
    update: { value: String(next) },
  });

  return `BT-${year}-${String(next).padStart(4, '0')}`;
}

module.exports = { nextInvoiceNumber, nextCreditNoteNumber, nextTransferNumber };