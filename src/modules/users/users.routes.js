const express = require('express');
const usersController = require('./users.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const requireAdmin = require('../../middlewares/admin.middleware');

const router = express.Router();

// GET /api/users/admin/all — liste tous les utilisateurs (admin)
router.get('/admin/all', authenticate, requireAdmin, usersController.getAllUsers);

// POST /api/users/admin/staff — créer un compte staff + assigner à une boutique
router.post('/admin/staff', authenticate, requireAdmin, usersController.createStaffUser);

// PUT /api/users/admin/:id/password — réinitialiser le mot de passe
router.put('/admin/:id/password', authenticate, requireAdmin, usersController.resetUserPassword);

// PUT /api/users/admin/:id/role — changer le rôle d'un utilisateur
router.put('/admin/:id/role', authenticate, requireAdmin, usersController.updateUserRole);

// GET /api/users — mon profil
router.get('/', authenticate, usersController.getCurrentUser);

// PUT /api/users — modifier mon profil
router.put('/', authenticate, usersController.updateCurrentUser);

module.exports = router;