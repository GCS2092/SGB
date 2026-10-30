const multer = require('multer');
const path = require('path');
const os = require('os');

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif',
];

const storage = multer.diskStorage({
  destination: os.tmpdir(),
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    return cb(
      new Error('Format non supporté. Utilisez JPEG, PNG, WebP ou AVIF.'),
      false,
    );
  }
  cb(null, true);
}

const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 Mo max
});

module.exports = { uploadMiddleware };