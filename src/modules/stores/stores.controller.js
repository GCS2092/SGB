const prisma = require('../../config/database');
const { logAudit } = require('../../services/audit.service');
const {
  listStores,
  assertStoreAccess,
  getMainStore,
} = require('./store.service');

async function getStores(req, res, next) {
  try {
    const stores = await listStores(req.user);
    res.json(stores);
  } catch (err) {
    next(err);
  }
}

async function getMainStoreHandler(req, res, next) {
  try {
    const store = await getMainStore();
    if (!store) {
      return res.status(404).json({ message: 'Boutique principale introuvable.' });
    }
    res.json(store);
  } catch (err) {
    next(err);
  }
}

async function createStore(req, res, next) {
  try {
    const {
      code, name, address, phone, taxRate, discountRate, currency, exchangeRate, isMain,
    } = req.body;

    if (!code?.trim() || !name?.trim()) {
      return res.status(400).json({ message: 'Code et nom de boutique requis.' });
    }

    const store = await prisma.$transaction(async (tx) => {
      if (isMain) {
        await tx.store.updateMany({ data: { isMain: false } });
      }
      const created = await tx.store.create({
        data: {
          code: code.trim().toUpperCase(),
          name: name.trim(),
          address: address || null,
          phone: phone || null,
          taxRate: Number(taxRate) || 0,
          discountRate: Number(discountRate) || 0,
          currency: currency || 'XOF',
          exchangeRate: Number(exchangeRate) || 1,
          isMain: Boolean(isMain),
        },
      });
      await logAudit({
        tx,
        userId: req.user?.id,
        storeId: created.id,
        action: 'STORE_CREATE',
        module: 'stores',
        entityId: created.id,
        entityType: 'Store',
        newValue: created,
        ip: req.ip,
      });
      return created;
    });

    res.status(201).json(store);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ message: 'Ce code boutique existe déjà.' });
    }
    next(err);
  }
}

async function updateStore(req, res, next) {
  try {
    const { id } = req.params;
    await assertStoreAccess(req.user, id);

    const existing = await prisma.store.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: 'Boutique introuvable.' });
    }

    const {
      name, address, phone, taxRate, discountRate, currency, exchangeRate, isActive, isMain,
    } = req.body;

    const store = await prisma.$transaction(async (tx) => {
      if (isMain) {
        await tx.store.updateMany({ where: { id: { not: id } }, data: { isMain: false } });
      }
      const updated = await tx.store.update({
        where: { id },
        data: {
          ...(name !== undefined && { name: name.trim() }),
          ...(address !== undefined && { address }),
          ...(phone !== undefined && { phone }),
          ...(taxRate !== undefined && { taxRate: Number(taxRate) }),
          ...(discountRate !== undefined && { discountRate: Number(discountRate) }),
          ...(currency !== undefined && { currency }),
          ...(exchangeRate !== undefined && { exchangeRate: Number(exchangeRate) }),
          ...(isActive !== undefined && { isActive: Boolean(isActive) }),
          ...(isMain !== undefined && { isMain: Boolean(isMain) }),
        },
      });
      await logAudit({
        tx,
        userId: req.user?.id,
        storeId: id,
        action: 'STORE_UPDATE',
        module: 'stores',
        entityId: id,
        entityType: 'Store',
        oldValue: existing,
        newValue: updated,
        ip: req.ip,
      });
      return updated;
    });

    res.json(store);
  } catch (err) {
    next(err);
  }
}

async function assignUserToStore(req, res, next) {
  try {
    const { userId, storeId, role } = req.body;
    if (!userId || !storeId) {
      return res.status(400).json({ message: 'Utilisateur et boutique requis.' });
    }

    const link = await prisma.userStore.upsert({
      where: { userId_storeId: { userId, storeId } },
      create: { userId, storeId, role: role || 'MANAGER' },
      update: { role: role || 'MANAGER' },
    });

    await logAudit({
      userId: req.user?.id,
      storeId,
      action: 'USER_STORE_ASSIGN',
      module: 'stores',
      entityId: link.id,
      entityType: 'UserStore',
      newValue: link,
      ip: req.ip,
    });

    res.json(link);
  } catch (err) {
    next(err);
  }
}

async function getUserStores(req, res, next) {
  try {
    const { userId } = req.params;
    const links = await prisma.userStore.findMany({
      where: { userId },
      include: { store: { select: { id: true, code: true, name: true, isMain: true } } },
    });
    res.json(links);
  } catch (err) {
    next(err);
  }
}

async function removeUserFromStore(req, res, next) {
  try {
    const { userId, storeId } = req.body;
    if (!userId || !storeId) {
      return res.status(400).json({ message: 'Utilisateur et boutique requis.' });
    }

    await prisma.userStore.delete({
      where: { userId_storeId: { userId, storeId } },
    });

    await logAudit({
      userId: req.user?.id,
      storeId,
      action: 'USER_STORE_REMOVE',
      module: 'stores',
      entityId: userId,
      entityType: 'UserStore',
      oldValue: { userId, storeId },
      ip: req.ip,
    });

    res.json({ message: 'Retiré de la boutique.' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStores,
  getMainStoreHandler,
  createStore,
  updateStore,
  assignUserToStore,
  getUserStores,
  removeUserFromStore,
};