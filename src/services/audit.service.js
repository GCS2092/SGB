const prisma = require('../config/database');

async function logAudit({
  userId = null,
  storeId = null,
  action,
  module,
  entityId = null,
  entityType = null,
  oldValue = null,
  newValue = null,
  ip = null,
  tx = null,
}) {
  const client = tx || prisma;
  return client.auditLog.create({
    data: {
      userId,
      storeId,
      action,
      module,
      entityId,
      entityType,
      oldValue: oldValue ?? undefined,
      newValue: newValue ?? undefined,
      ip,
    },
  });
}

module.exports = { logAudit };
