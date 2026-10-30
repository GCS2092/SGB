// Autorise ADMIN et STAFF, bloque CUSTOMER
function requireStaff(req, res, next) {
  if (!req.user || (req.user.role !== 'ADMIN' && req.user.role !== 'STAFF')) {
    return res.status(403).json({ message: 'Accès réservé au staff.' });
  }
  next();
}

module.exports = requireStaff;