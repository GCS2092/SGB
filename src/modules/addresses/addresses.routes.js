const express = require('express');
const addressesController = require('./addresses.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

const router = express.Router();
router.use(authenticate);

/**
 * @swagger
 * /api/addresses:
 *   get:
 *     summary: Mes adresses
 *     tags: [Adresses]
 *     responses:
 *       200:
 *         description: Liste des adresses
 */
router.get('/', addressesController.getAddresses);

/**
 * @swagger
 * /api/addresses:
 *   post:
 *     summary: Ajouter une adresse
 *     tags: [Adresses]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             label: Domicile
 *             fullName: Aminata Diallo
 *             phone: "+221770000001"
 *             street: Rue 10 Almadies
 *             city: Dakar
 *             country: Sénégal
 *             isDefault: true
 *     responses:
 *       201:
 *         description: Adresse créée
 */
router.post('/', addressesController.createAddress);

/**
 * @swagger
 * /api/addresses/{id}:
 *   put:
 *     summary: Modifier une adresse
 *     tags: [Adresses]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             city: Saint-Louis
 *     responses:
 *       200:
 *         description: Adresse modifiée
 */
router.put('/:id', addressesController.updateAddress);

/**
 * @swagger
 * /api/addresses/{id}:
 *   delete:
 *     summary: Supprimer une adresse
 *     tags: [Adresses]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204:
 *         description: Supprimée
 */
router.delete('/:id', addressesController.deleteAddress);

module.exports = router;
