const fs = require('fs').promises;
const cloudinary = require('../../config/cloudinary');
const prisma = require('../../config/database');

// Nombre max d'uploads Cloudinary lancés EN MÊME TEMPS.
// Sur Render free (RAM/CPU limités), 5 est un bon compromis entre vitesse et stabilité.
const CONCURRENCY_LIMIT = 5;

async function uploadImage(file, userId) {
  try {
    const result = await cloudinary.uploader.upload(file.path, {
      folder: 'sgb/products',
      resource_type: 'image',
      timeout: 30000, // évite qu'un upload bloque indéfiniment si Cloudinary répond lentement
      transformation: [
        { width: 1600, height: 1600, crop: 'limit' },
        { quality: 'auto:good', fetch_format: 'auto' },
      ],
    });

    await prisma.uploadedImage.create({
      data: {
        publicId: result.public_id,
        url: result.secure_url,
        uploadedBy: userId,
      },
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
    };
  } finally {
    if (file?.path) {
      fs.unlink(file.path).catch(() => {});
    }
  }
}

// Exécute une liste de tâches asynchrones avec un nombre limité d'exécutions simultanées.
// Évite de saturer la RAM/CPU/réseau de l'instance Render en lançant tout en parallèle.
async function runWithConcurrencyLimit(items, limit, worker) {
  const results = new Array(items.length);
  let currentIndex = 0;
  async function runNext() {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      try {
        const value = await worker(items[index], index);
        results[index] = { status: 'fulfilled', value };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }
  // Lance `limit` "workers" qui piochent les tâches restantes au fur et à mesure
  const workers = Array.from({ length: Math.min(limit, items.length) }, runNext);
  await Promise.all(workers);
  return results;
}

// Upload plusieurs images, avec un maximum de CONCURRENCY_LIMIT uploads simultanés
async function uploadImages(files, userId) {
  const results = await runWithConcurrencyLimit(files, CONCURRENCY_LIMIT, (file) =>
    uploadImage(file, userId),
  );
  return results.map((r, i) => {
    if (r.status === 'fulfilled') {
      return { success: true, originalName: files[i].originalname, ...r.value };
    }
    return { success: false, originalName: files[i].originalname, error: r.reason.message };
  });
}

async function deleteImage(publicId, user) {
  const decoded = decodeURIComponent(publicId);

  const record = await prisma.uploadedImage.findUnique({
    where: { publicId: decoded },
  });

  // Si l'image n'est pas tracée (ex: uploadée avant la mise en place de ce système),
  // seul un admin peut la supprimer pour éviter tout accès non contrôlé.
  if (!record) {
    if (user.role !== 'ADMIN') {
      const err = new Error('Image introuvable ou accès refusé.');
      err.statusCode = 403;
      throw err;
    }
  } else if (user.role !== 'ADMIN' && record.uploadedBy !== user.id) {
    const err = new Error('Vous ne pouvez supprimer que vos propres images.');
    err.statusCode = 403;
    throw err;
  }

  await cloudinary.uploader.destroy(decoded, { resource_type: 'image' });

  if (record) {
    await prisma.uploadedImage.delete({ where: { publicId: decoded } });
  }
}

module.exports = { uploadImage, uploadImages, deleteImage };