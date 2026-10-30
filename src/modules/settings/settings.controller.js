const settingsService = require('./settings.service');

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
    const settings = await settingsService.updateSettings(req.body);
    res.json(settings);
  } catch (err) {
    next(err);
  }
}

module.exports = { getSettings, updateSettings };
