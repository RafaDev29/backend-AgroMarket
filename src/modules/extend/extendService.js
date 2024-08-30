const db = require('../../config/db');
const extendCreateModel = require('./model/extendCreateModel');

const createExtend = async (data) => {

  const { error } = extendCreateModel.validate(data);
  if (error) {
    throw new Error(error.details[0].message);
  }

  try {
    const query = 'INSERT INTO tb_extend (name) VALUES (?)';
    const values = [data.name];
    const [result] = await db.query(query, values);
    
    return { categoryId: result.insertId, name: data.name };
  } catch (err) {
    throw new Error('Error creating category: ' + err.message);
  }
};

const listExtend = async () => {
  try {
    const [extend] = await db.query('SELECT * FROM tb_extend');
    return extend;
  } catch (err) {
    throw new Error('Error retrieving categories: ' + err.message);
  }
};

module.exports = { createExtend, listExtend };
