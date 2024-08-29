const { successResponse, errorResponse } = require('../../utils/response');
const productsService = require('./productsService');
const productsCreateModel = require('./model/productsCreateModel');

const createProduct = async (req, res) => {
  // Validar los campos del producto usando el modelo
  const { error } = productsCreateModel.validate(req.body);
  if (error) {
    return errorResponse(res, error.details[0].message, 400);
  }

  try {
    // Obtener el userId del token JWT
    const userId = req.user.userId;
    const result = await productsService.createProduct(req.body, userId, req.files);
    successResponse(res, 'Product created successfully with images', result);
  } catch (err) {
    errorResponse(res, err.message, 500);
  }
};
const getProductsByProducer = async (req, res) => {
  try {
    // Obtener el userId del token JWT
    const userId = req.user.userId;
    const products = await productsService.listProductsByProducer(userId);
    successResponse(res, 'Products retrieved successfully', products);
  } catch (err) {
    errorResponse(res, err.message, 500);
  }
};

const getAllProducts = async (req, res) => {
  try {
    const products = await productsService.listAllProducts();
    successResponse(res, 'All products retrieved successfully', products);
  } catch (err) {
    errorResponse(res, err.message, 500);
  }
};

const updateProduct = async (req, res) => {
  const { productId } = req.params;

  // Validar el body usando el modelo de creación existente
  const { error } = productsCreateModel.validate(req.body);
  if (error) {
    return errorResponse(res, error.details[0].message, 400);
  }

  try {
    // Obtener el userId del token JWT
    const userId = req.user.userId;

    const result = await productsService.updateProduct(productId, req.body, userId, req.files);
    successResponse(res, 'Product updated successfully', result);
  } catch (err) {
    errorResponse(res, err.message, 403); // 403 Forbidden si el producto no le pertenece o no existe
  }
};

const deleteProduct = async (req, res) => {
  const { productId } = req.params;

  try {
 
    const userId = req.user.userId;

    const result = await productsService.deleteProduct(productId, userId);
    successResponse(res, result.message);
  } catch (err) {
    errorResponse(res, err.message, 403); // 403 Forbidden si el producto no le pertenece o no existe
  }
};

const getProductById = async (req, res) => {
  try {
    const { productId } = req.params;
    const product = await productsService.getProductById(productId);
    successResponse(res, 'Producto obtenido exitosamente', product);
  } catch (err) {
    errorResponse(res, err.message, 404);
  }
};

module.exports = { createProduct, getProductsByProducer, getAllProducts, updateProduct, deleteProduct, getProductById};
