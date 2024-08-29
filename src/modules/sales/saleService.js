const db = require('../../config/db');
const saleCreateModel = require('./model/saleCreateModel');

const createSale = async (data, user) => {
  const { error } = saleCreateModel.validate(data);
  if (error) {
    throw new Error(error.details[0].message);
  }

  if (user.role !== 'CUSTOMER') {
    throw new Error('No estás autorizado para realizar esta operación');
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Obtener el customer_id utilizando el user_id del token
    const [customer] = await connection.query('SELECT id FROM tb_customer WHERE user_id = ?', [user.user_id]);

    if (customer.length === 0) {
      throw new Error('El cliente no existe');
    }

    const customerId = customer[0].id;

    // Obtener el precio y unitExtent del producto desde la tabla tb_products
    const [product] = await connection.query('SELECT price, unitExtent FROM tb_products WHERE id = ?', [data.product_id]);

    if (product.length === 0) {
      throw new Error('El producto no existe');
    }

    const unitPrice = product[0].price;
    const unitExtent = product[0].unitExtent;

    // Calcular el subtotal y el IGV
    const subtotal = unitPrice * data.amount;
    const igv = subtotal * 0.18;

    // Calcular el totalPrice
    const totalPrice = subtotal + igv;

    // Insertar en tb_sales
    const saleQuery = 'INSERT INTO tb_sales (customer_id, amount, totalPrice) VALUES (?, ?, ?)';
    const saleValues = [customerId, data.amount, totalPrice];
    const [saleResult] = await connection.query(saleQuery, saleValues);

    const saleId = saleResult.insertId;

    // Insertar detalles en tb_detailSale
    const detailQuery = 'INSERT INTO tb_detailSale (sale_id, product_id, unitPrice, igv, unitExtent, voucher_id, status, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
    const detailValues = [saleId, data.product_id, unitPrice, igv, unitExtent, null, 'solicitado', subtotal];
    await connection.query(detailQuery, detailValues);

    await connection.commit();

    return {
      saleId,
      message: 'Venta creada exitosamente'
    };
  } catch (err) {
    await connection.rollback();
    throw new Error('Error al crear la venta: ' + err.message);
  } finally {
    connection.release();
  }
};

module.exports = { createSale };
