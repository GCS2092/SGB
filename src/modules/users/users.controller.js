const usersService = require('./users.service');

async function getAllUsers(req, res, next) {
  try {
    const result = await usersService.getAllUsers(req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getCurrentUser(req, res, next) {
  try {
    const user = await usersService.getUserById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable.' });
    res.json(user);
  } catch (err) {
    next(err);
  }
}

async function updateCurrentUser(req, res, next) {
  try {
    const { role, ...safeData } = req.body;
    const updated = await usersService.updateUser(req.user.id, safeData);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

async function createStaffUser(req, res, next) {
  try {
    const { email, password, firstName, lastName, phone, storeId, storeRole } = req.body;

    if (!email?.trim() || !password || !firstName?.trim() || !lastName?.trim()) {
      return res.status(400).json({ message: 'Email, mot de passe, prénom et nom sont requis.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 6 caractères.' });
    }

    const user = await usersService.createStaffUser({
      email: email.trim(),
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone,
      storeId,
      storeRole,
    });

    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
}

async function resetUserPassword(req, res, next) {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 6 caractères.' });
    }

    await usersService.updateUser(id, { password });
    res.json({ message: 'Mot de passe mis à jour.' });
  } catch (err) {
    next(err);
  }
}

async function updateUserRole(req, res, next) {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['CUSTOMER', 'SELLER', 'STAFF', 'ADMIN'].includes(role)) {
      return res.status(400).json({ message: 'Rôle invalide.' });
    }

    const updated = await usersService.updateUser(id, { role });
    res.json({ message: 'Rôle mis à jour.', role: updated.role });
  } catch (err) {
    next(err);
  }
}

module.exports = { getAllUsers, getCurrentUser, updateCurrentUser, createStaffUser, resetUserPassword, updateUserRole };