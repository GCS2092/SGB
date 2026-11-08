const { PrismaClient, Prisma } = require('@prisma/client');
const fs = require('fs'); const path = require('path');
const prisma = new PrismaClient();
(async () => {
  const dir = path.join(__dirname, '..', '..', '_db_backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = {};
  for (const m of Prisma.dmmf.datamodel.models) {
    const key = m.name.charAt(0).toLowerCase() + m.name.slice(1);
    out[m.name] = await prisma[key].findMany();
    console.log(m.name.padEnd(22), out[m.name].length);
  }
  const file = path.join(dir, 'backup-' + stamp + '.json');
  fs.writeFileSync(file, JSON.stringify(out));
  console.log('\nSauvegarde :', file);
})().catch(e => console.error('ERREUR :', e.message)).finally(() => prisma.$disconnect());
