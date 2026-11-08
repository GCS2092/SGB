const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  await prisma.$queryRaw`SELECT 1`;
  console.log('Connexion BDD : OK\n');
  const users = await prisma.user.findMany({ select: { email: true, role: true } });
  console.log('Nombre d utilisateurs :', users.length, '\n');
  console.log('ADMIN(S) :');
  users.filter(u => u.role === 'ADMIN').forEach(u => console.log('  ', u.email));
  console.log('\nTOUS :');
  users.forEach(u => console.log('  ', String(u.role).padEnd(8), u.email));
})().catch(e => console.error('ERREUR :', e.message)).finally(() => prisma.$disconnect());
