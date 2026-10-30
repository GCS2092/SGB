# SGB - Systeme de Gestion de Stock

API Node.js / Express / Prisma / PostgreSQL : stock multi-boutiques, commandes, factures,
avoirs, bons de commande fournisseur, inventaires, transferts, comptabilite, 2FA.

## Demarrage
    npm install
    copy .env.example .env   # puis remplir DATABASE_URL et JWT_SECRET (32+ caracteres)
    npx prisma migrate dev
    npm run db:seed
    npm run dev

## Scripts
dev, start, db:migrate, db:generate, db:studio, db:seed, test

