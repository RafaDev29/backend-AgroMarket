const Joi = require('joi');

const productsCreateModel = Joi.object({
  name: Joi.string().required().messages({
    'string.empty': 'Product name is required',
    'any.required': 'Product name is required'
  }),
  description: Joi.string().optional(),
  category_id: Joi.number().integer().required().messages({
    'number.base': 'Category ID must be an integer',
    'any.required': 'Category ID is required'
  }),
  price: Joi.string().required().messages({
    'string.empty': 'Price is required',
    'any.required': 'Price is required'
  }),
  stock: Joi.number().integer().required().messages({
    'number.base': 'Stock must be an integer',
    'any.required': 'Stock is required'
  }),
  unitExtent: Joi.string().optional(),
  bulk_price: Joi.string().optional(),
  bulk_quantity: Joi.number().integer().optional(),
});

module.exports = productsCreateModel;
