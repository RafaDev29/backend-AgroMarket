const Joi = require('joi');

const categoryCreateModel = Joi.object({
  name: Joi.string().required().messages({
    'string.empty': 'Category name is required',
    'any.required': 'Category name is required'
  })
});

module.exports = categoryCreateModel;
