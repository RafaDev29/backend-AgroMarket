const { successResponse, errorResponse } = require('../../utils/response');
const saleService = require('./saleService');

const createSale = async (req, res) => {
  try {
    // Extraer el user_id correctamente del token
    const userId = req.user.userId;
    console.log('User ID:', userId);

    const result = await saleService.createSale(req.body, { userId, role: req.user.role });
    successResponse(res, result.message, { saleId: result.saleId });
  } catch (err) {
    errorResponse(res, err.message, 400);
  }
};

module.exports = { createSale };
