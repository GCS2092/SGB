const addressesService = require('./addresses.service');

async function getAddresses(req, res, next) {
  try {
    const addresses = await addressesService.getAddresses(req.user.id);
    res.json(addresses);
  } catch (error) {
    next(error);
  }
}

async function createAddress(req, res, next) {
  try {
    const address = await addressesService.createAddress(req.user.id, req.body);
    res.status(201).json(address);
  } catch (error) {
    next(error);
  }
}

async function updateAddress(req, res, next) {
  try {
    const address = await addressesService.updateAddress(req.user.id, req.params.id, req.body);
    res.json(address);
  } catch (error) {
    next(error);
  }
}

async function deleteAddress(req, res, next) {
  try {
    await addressesService.deleteAddress(req.user.id, req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

const addressesController = {
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
};

module.exports = addressesController;
