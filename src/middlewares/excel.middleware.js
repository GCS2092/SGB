const multer = require('multer');

const ALLOWED_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
];

function fileFilter(_req, file, cb) {
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    return cb(new Error('Format non supporté. Utilisez un fichier .xlsx ou .xls.'), false);
  }
  cb(null, true);
}

const excelUploadMiddleware = multer({
  storage: multer.memoryStorage(), // pas besoin de disque, on parse direct le buffer
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 Mo max
});

module.exports = { excelUploadMiddleware };