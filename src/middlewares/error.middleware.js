const { mapPrismaError } = require('../utils/prisma-error.utils');
const logger = require('../config/logger');

function errorHandler(err, req, res, next) {
  const mapped = mapPrismaError(err) || err;
  const status = mapped.status || 500;
  const message =
    status === 500 && process.env.NODE_ENV === 'production'
      ? 'Une erreur est survenue. Veuillez réessayer.'
      : mapped.message || 'Erreur interne du serveur';

  if (status >= 500) {
    logger.error({ err, url: req.originalUrl }, 'Erreur serveur');
  }

  res.status(status).json({
    message,
    ...(process.env.NODE_ENV !== 'production' && status >= 500
      ? { stack: err.stack }
      : {}),
  });
}

module.exports = errorHandler;
