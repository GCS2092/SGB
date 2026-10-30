function logError(error) {
  if (process.env.NODE_ENV === 'production') {
    console.error(error);
    return;
  }

  console.error('[ERROR]', error.stack || error.message || error);
}

function logRequest(req) {
  console.log(`${req.method} ${req.originalUrl}`);
}

module.exports = {
  logError,
  logRequest,
};
