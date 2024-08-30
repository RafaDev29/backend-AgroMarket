const Joi = require('joi');

const categoryCreateModel = Joi.object({
  name: Joi.string().required().messages({
    'string.empty': 'extend name is required',
    'any.required': 'extend name is required'
  })
});

module.exports = categoryCreateModel;
