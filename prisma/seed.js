const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) throw new Error('SEED_ADMIN_EMAIL et SEED_ADMIN_PASSWORD requis');

  const store = await prisma.store.upsert({
    where: { code: 'SGB' },
    update: {},
    create: { code: 'SGB', name: 'SGB', isMain: true, isActive: true, currency: 'XOF' },
  });
  console.log('Store principal :', store.code, store.id);

  let admin = await prisma.user.findUnique({ where: { email } });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        email,
        password: await bcrypt.hash(password, 10),
        firstName: 'Admin',
        lastName: 'SGB',
        role: 'ADMIN',
      },
    });
    console.log('Admin cree :', email);
  } else {
    console.log('Admin deja present :', email);
  }

  const link = await prisma.userStore.findFirst({ where: { userId: admin.id, storeId: store.id } });
  if (!link) {
    await prisma.userStore.create({ data: { userId: admin.id, storeId: store.id } });
    console.log('Admin rattache au store SGB');
  }

  await prisma.setting.upsert({
    where: { key: 'company_name' },
    update: {},
    create: { key: 'company_name', value: 'SGB' },
  });
  console.log('Seed termine.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());