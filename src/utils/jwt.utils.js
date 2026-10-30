const jwt = require('jsonwebtoken');

function signToken(payload, options = {}) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    ...options,
  });
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
}

module.exports = {
  signToken,
  verifyToken,
};