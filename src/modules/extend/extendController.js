const { successResponse, errorResponse } = require('../../utils/response');
const extendService = require('./extendService');

const createExtend = async (req, res) => {
  try {
    const result = await extendService.createExtend(req.body);
    successResponse(res, 'Category created successfully', result);
  } catch (err) {
    errorResponse(res, err.message, 400);
  }
};

const listExtend = async (req, res) => {
  try {
    const extend = await extendService.listExtend();
    successResponse(res, 'extend retrieved successfully', extend);
  } catch (err) {
    errorResponse(res, err.message, 500);
  }
};

module.exports = { createExtend, listExtend };
