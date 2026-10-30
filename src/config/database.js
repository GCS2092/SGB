const { PrismaClient } = require('@prisma/client');

// Le pooling de connexions se configure principalement via les paramètres
// dans DATABASE_URL (connection_limit, pool_timeout) — voir .env / variables
// d'environnement Render. Ce fichier active juste le log des requêtes lentes
// pour pouvoir surveiller la latence réelle en prod si besoin.
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'production'
    ? [{ emit: 'event', level: 'warn' }, { emit: 'event', level: 'error' }]
    : ['warn', 'error'],
});

module.exports = prisma;