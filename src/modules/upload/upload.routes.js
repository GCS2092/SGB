const express = require('express');
const multer = require('multer');
const uploadController = require('./upload.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireAdminOrSeller } = require('../../middlewares/seller.middleware');
const { uploadMiddleware } = require('../../middlewares/upload.middleware');

const router = express.Router();

// Wrapper qui exécute un middleware Multer et capture ses erreurs proprement
// (au lieu de laisser MulterError remonter en 500 brut au client).
function handleUpload(multerMiddleware) {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({
            message: 'Trop de fichiers envoyés en une seule fois (maximum 30 par requête).',
          });
        }
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            message: 'Un ou plusieurs fichiers dépassent la taille maximale autorisée (5 Mo).',
          });
        }
        return res.status(400).json({ message: err.message });
      }
      if (err) {
        // Erreur venant du fileFilter (format non supporté) ou autre
        return res.status(400).json({ message: err.message });
      }
      next();
    });
  };
}

// POST /api/upload/image — upload 1 image → { url, publicId }
router.post(
  '/image',
  authenticate,
  requireAdminOrSeller,
  handleUpload(uploadMiddleware.single('image')),
  uploadController.uploadImage,
);

// POST /api/upload/images — upload plusieurs images d'un coup → { images: [...] }
router.post(
  '/images',
  authenticate,
  requireAdminOrSeller,
  handleUpload(uploadMiddleware.array('images', 30)),
  uploadController.uploadImages,
);

// DELETE /api/upload/image/:publicId — supprime une image Cloudinary
// Admin: supprime n'importe quelle image. Seller: uniquement les siennes (vérifié dans le service).
router.delete(
  '/image/:publicId',
  authenticate,
  requireAdminOrSeller,
  uploadController.deleteImage,
);

module.exports = router;