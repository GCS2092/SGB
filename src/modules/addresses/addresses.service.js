const prisma = require('../../config/database');

async function getAddresses(userId) {
  return prisma.address.findMany({ where: { userId } });
}

async function createAddress(userId, data) {
  if (data.isDefault) {
    await prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
  }
  return prisma.address.create({ data: { userId, ...data } });
}

async function updateAddress(userId, id, data) {
  const address = await prisma.address.findUnique({ where: { id } });
  if (!address || address.userId !== userId) {
    const error = new Error('Adresse introuvable ou accès interdit.');
    error.status = 404;
    throw error;
  }

  if (data.isDefault) {
    await prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
  }

  return prisma.address.update({
    where: { id },
    data,
  });
}

async function deleteAddress(userId, id) {
  const address = await prisma.address.findUnique({ where: { id } });
  if (!address || address.userId !== userId) {
    const error = new Error('Adresse introuvable ou accès interdit.');
    error.status = 404;
    throw error;
  }

  return prisma.address.delete({ where: { id } });
}

module.exports = {
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
};
