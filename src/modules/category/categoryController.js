const { successResponse, errorResponse } = require('../../utils/response');
const categoryService = require('./categoryService');

const createCategory = async (req, res) => {
  try {
    const result = await categoryService.createCategory(req.body);
    successResponse(res, 'Category created successfully', result);
  } catch (err) {
    errorResponse(res, err.message, 400);
  }
};

const listCategories = async (req, res) => {
  try {
    const categories = await categoryService.listCategories();
    successResponse(res, 'Categories retrieved successfully', categories);
  } catch (err) {
    errorResponse(res, err.message, 500);
  }
};

module.exports = { createCategory, listCategories };
