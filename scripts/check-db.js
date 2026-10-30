const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tables = await prisma.$queryRaw`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('Store', 'UserStore', 'StockTransfer', 'CreditNote', 'InvoiceSequence_new')
    ORDER BY 1
  `;
  console.log('Tables:', tables);

  try {
    const stores = await prisma.$queryRaw`SELECT id, code, name FROM "Store" LIMIT 5`;
    console.log('Stores:', stores);
  } catch (e) {
    console.log('Store query error:', e.message);
  }
}

main().finally(() => prisma.$disconnect());
