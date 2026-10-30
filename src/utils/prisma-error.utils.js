const PRISMA_MESSAGES = {
  P2002: 'Cette valeur existe déjà. Veuillez utiliser une autre référence.',
  P2003: 'Référence invalide : un élément lié est introuvable.',
  P2025: 'Élément introuvable ou déjà supprimé.',
};

function mapPrismaError(err) {
  if (!err?.code) return null;

  const message = PRISMA_MESSAGES[err.code];
  if (!message) return null;

  const error = new Error(message);
  error.status = 409;
  return error;
}

module.exports = { mapPrismaError };
