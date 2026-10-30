const uploadService = require('./upload.service');

async function uploadImage(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Aucun fichier reçu' });
    }
    const result = await uploadService.uploadImage(req.file, req.user.id);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

// Upload multiple en une requête
async function uploadImages(req, res, next) {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'Aucun fichier reçu' });
    }
    const results = await uploadService.uploadImages(req.files, req.user.id);
    res.status(201).json({ images: results });
  } catch (error) {
    next(error);
  }
}

async function deleteImage(req, res, next) {
  try {
    await uploadService.deleteImage(req.params.publicId, req.user);
    res.status(204).end();
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
}

module.exports = {
  uploadImage,
  uploadImages,
  deleteImage,
};