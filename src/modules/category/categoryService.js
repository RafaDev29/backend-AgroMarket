const db = require('../../config/db');
const categoryCreateModel = require('./model/categoryCreateModel');

const createCategory = async (data) => {
  // Validar los datos usando el modelo
  const { error } = categoryCreateModel.validate(data);
  if (error) {
    throw new Error(error.details[0].message);
  }

  try {
    const query = 'INSERT INTO tb_category (name) VALUES (?)';
    const values = [data.name];
    const [result] = await db.query(query, values);
    
    return { categoryId: result.insertId, name: data.name };
  } catch (err) {
    throw new Error('Error creating category: ' + err.message);
  }
};

const listCategories = async () => {
  try {
    const [categories] = await db.query('SELECT * FROM tb_category');
    return categories;
  } catch (err) {
    throw new Error('Error retrieving categories: ' + err.message);
  }
};

module.exports = { createCategory, listCategories };
