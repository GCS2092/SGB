const morgan = require('morgan');

const requestLogger = morgan(':method :url :status :res[content-length] - :response-time ms');

module.exports = requestLogger;
