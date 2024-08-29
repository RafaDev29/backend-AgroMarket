const { successResponse, errorResponse } = require('../../utils/response');
const saleService = require('./saleService');

const createSale = async (req, res) => {
  try {
  
    
    const role = req.user.role;
    const user_id = req.user.userId;

    const result = await saleService.createSale(req.body, user_id, role);
    successResponse(res, result.message, { saleId: result.saleId });
  } catch (err) {
    errorResponse(res, err.message, 400);
  }
};

const updateSale = async (req, res) => {
    try {
        const saleId = req.params.saleId;
        const role = req.user.role;
        const result = await saleService.updateSale(saleId, req.body, req.file, role); // Cambiado req.files a req.file
        successResponse(res, result.message, result.data);
    } catch (err) {
        errorResponse(res, err.message, 400);
    }
};

const addPaymentImage = async (req, res) => {
    try {
      const userId = req.user.userId; // Obtenemos el user_id del token
      const saleId = req.params.saleId; // Obtenemos el saleId de los parámetros de la ruta
      const result = await saleService.addPaymentImage(userId, saleId, req.file);
      successResponse(res, result.message, result.data);
    } catch (err) {
      errorResponse(res, err.message, 400);
    }
  };


const listSales = async (req, res) => {
    try {
      const userId = req.user.userId; // Obtenemos el user_id del token
      const role = req.user.role; // Obtenemos el rol del usuario
      const result = await saleService.listSales(userId, role);
      successResponse(res, 'Ventas listadas exitosamente', result);
    } catch (err) {
      errorResponse(res, err.message, 400);
    }
  };


  const getSaleById = async (req, res) => {
    try {
      const userId = req.user.userId; // Obtenemos el user_id del token
      const role = req.user.role; // Obtenemos el rol del usuario
      const saleId = req.params.saleId; // Obtenemos el saleId de los parámetros de la ruta
      const result = await saleService.getSaleById(userId, role, saleId);
      successResponse(res, 'Venta listada exitosamente', result);
    } catch (err) {
      errorResponse(res, err.message, 400);
    }
  };


  const deleteSale = async (req, res) => {
    try {
      const userId = req.user.userId; // Obtenemos el user_id del token
      const role = req.user.role; // Obtenemos el rol del usuario
      const saleId = req.params.saleId; // Obtenemos el saleId de los parámetros de la ruta
      const result = await saleService.deleteSale(userId, role, saleId);
      successResponse(res, result.message);
    } catch (err) {
      errorResponse(res, err.message, 400);
    }
  };
module.exports = { createSale, updateSale , addPaymentImage, listSales, getSaleById, deleteSale };
