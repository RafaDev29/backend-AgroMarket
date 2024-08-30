const Joi = require('joi');

const saleCreateModel = Joi.object({
  product_id: Joi.number().integer().required().messages({
    'number.base': 'El campo "product_id" debe ser un número entero',
    'any.required': 'El campo "product_id" es obligatorio'
  }),
  amount: Joi.number().integer().required().messages({
    'number.base': 'El campo "amount" debe ser un número entero',
    'any.required': 'El campo "amount" es obligatorio'
  }),

  unitExtent: Joi.required().messages({
    
    'any.required': 'El campo "amount" es obligatorio'
  })
});

module.exports = saleCreateModel;
