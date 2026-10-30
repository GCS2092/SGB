const settingsService = require('./settings.service');
const { logAudit } = require('../../services/audit.service');

const KEY_RE = /^[a-z0-9_]{1,64}$/;
const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k] ?? null]));

async function getSettings(req, res, next) {
  try {
    const settings = await settingsService.getSettings();
    res.json(settings);
  } catch (err) {
    next(err);
  }
}

async function updateSettings(req, res, next) {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ message: 'Corps de requête invalide.' });
    }
    const invalid = Object.entries(body).find(
      ([k, v]) => !KEY_RE.test(k) || !['string', 'number', 'boolean'].includes(typeof v),
    );
    if (invalid) {
      return res.status(400).json({ message: `Paramètre invalide : ${invalid[0]}` });
    }

    const before = await settingsService.getSettings();
    const settings = await settingsService.updateSettings(body);

    const changed = Object.keys(body).filter((k) => String(before[k] ?? '') !== String(settings[k] ?? ''));
    if (changed.length) {
      await logAudit({
        userId: req.user?.id,
        action: 'SETTINGS_UPDATE',
        module: 'settings',
        entityType: 'Setting',
        oldValue: pick(before, changed),
        newValue: pick(settings, changed),
        ip: req.ip,
      });
    }
    res.json(settings);
  } catch (err) {
    next(err);
  }
}

module.exports = { getSettings, updateSettings };
