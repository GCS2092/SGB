const bcrypt = require('bcryptjs');
const prisma = require('../../config/database');

async function getUserById(id) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
    },
  });
}

async function getAllUsers(query = {}) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, parseInt(query.limit) || 50);
  const skip = (page - 1) * limit;
  const search = query.search || '';

  const where = search
    ? {
        OR: [
          { email: { contains: search } },
          { firstName: { contains: search } },
          { lastName: { contains: search } },
        ],
      }
    : {};

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        createdAt: true,
        _count: { select: { orders: true } },
      },
    }),
  ]);

  return { data: users, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function updateUser(id, data) {
  const updateData = { ...data };

  if (data.password) {
    updateData.password = await bcrypt.hash(data.password, 10);
  }

  if (data.email) {
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existingUser && existingUser.id !== id) {
      const error = new Error('Cet email est déjà utilisé.');
      error.status = 400;
      throw error;
    }
  }

  return prisma.user.update({
    where: { id },
    data: updateData,
  });
}

async function createStaffUser({ email, password, firstName, lastName, phone, storeId, storeRole }) {
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const error = new Error('Cet email est déjà utilisé.');
    error.status = 400;
    throw error;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        phone: phone || null,
        role: 'STAFF', // ← correction : STAFF au lieu de CUSTOMER
      },
    });

    let userStore = null;
    if (storeId) {
      userStore = await tx.userStore.create({
        data: {
          userId: user.id,
          storeId,
          role: storeRole || 'MANAGER',
        },
      });
    }

    return { user, userStore };
  });

  return {
    id: result.user.id,
    email: result.user.email,
    firstName: result.user.firstName,
    lastName: result.user.lastName,
    role: result.user.role,
    storeId: result.userStore?.storeId || null,
    storeRole: result.userStore?.role || null,
  };
}

module.exports = { getUserById, getAllUsers, updateUser, createStaffUser };