const missing = ['DATABASE_URL', 'JWT_SECRET'].filter((k) => !process.env[k]);
if (missing.length) {
  console.error('Variables d\'environnement manquantes :', missing.join(', '));
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET trop court (32 caracteres minimum en production)');
  process.exit(1);
}