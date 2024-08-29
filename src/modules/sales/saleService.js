
const db = require('../../config/db');
const saleCreateModel = require('./model/saleCreateModel');
const Client = require('ssh2-sftp-client');
const sftp = new Client();

const createSale = async (data, user_id, role) => {
  const { error } = saleCreateModel.validate(data);
  if (error) {
    throw new Error(error.details[0].message);
  }

  if (role !== 'CUSTOMER') {
    throw new Error('No estás autorizado para realizar esta operación');
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Obtener el customer_id utilizando el user_id del token
    const [customer] = await connection.query('SELECT id FROM tb_customer WHERE user_id = ?', [user_id]);
  
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
const processFileName = (saleId, voucherId, originalName) => {
    const extension = originalName.split('.').pop(); // Obtener la extensión del archivo
    return `voucher_${saleId}_${voucherId}.${extension}`; // Generar el nuevo nombre de archivo
  };

const updateSale = async (saleId, data, file, userRole) => {
    if (userRole !== 'PRODUCER') {
      throw new Error('No estás autorizado para editar esta venta.');
    }
  
    const connection = await db.getConnection();
    const remoteHost = process.env.REMOTE_HOST;
    const remoteUser = process.env.REMOTE_USER;
    const remotePassword = process.env.REMOTE_PASSWORD;
    const remotePath = process.env.REMOTE_PATH;
  
    try {
      await connection.beginTransaction();
  
      // Verificar el status actual de la venta
      const [details] = await connection.query('SELECT * FROM tb_detailSale WHERE sale_id = ?', [saleId]);
      if (details.length === 0) {
        throw new Error('No se encontraron detalles de la venta');
      }
  
      const currentStatus = details[0].status;
  
      // Si el status es "culminado", no permitir la edición
      if (currentStatus === 'culminado') {
        throw new Error('No se puede editar una venta con estado "culminado"');
      }
  
      let voucherId = details[0].voucher_id;
      let fileName = null;  // Inicializamos fileName como null
  
      if (file) {
        const voucherType = 'COMPROBANTE'; // Tipo de voucher definido
  
        // Generar el nombre del archivo de la imagen del voucher
        fileName = processFileName(saleId, voucherId || 0, file.originalname);  // Generamos el nombre antes de insertar o actualizar
  
        // Si no existe un voucher_id con el type 'COMPROBANTE', crear uno nuevo
        if (!voucherId) {
          const voucherQuery = 'INSERT INTO tb_voucher (path, sale_id, type) VALUES (?, ?, ?)';
          const [voucherResult] = await connection.query(voucherQuery, [fileName, saleId, voucherType]);
          voucherId = voucherResult.insertId;
        } else {
          // Si ya existe un voucher, actualizamos su type y path
          const updateVoucherQuery = 'UPDATE tb_voucher SET path = ?, type = ? WHERE id = ?';
          await connection.query(updateVoucherQuery, [fileName, voucherType, voucherId]);
        }
  
        const remoteFilePath = `${remotePath}/${fileName}`;
  
        // Conectar y subir la imagen al servidor remoto
        await sftp.connect({
          host: remoteHost,
          username: remoteUser,
          password: remotePassword,
        });
        await sftp.put(file.buffer, remoteFilePath);
        sftp.end();
  
        // Asegurarse de que el voucher_id en tb_detailSale es el correcto
        await connection.query('UPDATE tb_detailSale SET voucher_id = ? WHERE sale_id = ?', [voucherId, saleId]);
      }
  
      if (data.status) {
        const updateStatusQuery = 'UPDATE tb_detailSale SET status = ? WHERE sale_id = ?';
        await connection.query(updateStatusQuery, [data.status, saleId]);
  
        // Si el status es "aprobado", reducir el stock del producto usando `amount`
        if (data.status === 'aprobado') {
          const [saleDetails] = await connection.query('SELECT amount FROM tb_sales WHERE id = ?', [saleId]);
          const amountSold = parseFloat(saleDetails[0].amount); // Convertir `amount` a número
          if (isNaN(amountSold)) {
            throw new Error('El valor de amount no es válido.');
          }
          const updateProductStockQuery = 'UPDATE tb_products SET stock = stock - ? WHERE id = ?';
          await connection.query(updateProductStockQuery, [amountSold, details[0].product_id]);
        }
      }
  
      await connection.commit();
  
      const [updatedDetails] = await connection.query(
        'SELECT * FROM tb_detailSale WHERE sale_id = ?',
        [saleId]
      );
  
      return {
        saleId,
        message: 'Venta actualizada exitosamente',
        data: {
          saleId,
          status: updatedDetails[0].status,
          voucher_id: voucherId,
          voucher_path: fileName,
          product_id: updatedDetails[0].product_id,
          unitPrice: updatedDetails[0].unitPrice,
          igv: updatedDetails[0].igv,
          unitExtent: updatedDetails[0].unitExtent,
          subtotal: updatedDetails[0].subtotal
        }
      };
    } catch (err) {
      await connection.rollback();
      sftp.end();
      throw new Error('Error al actualizar la venta: ' + err.message);
    } finally {
      connection.release();
    }
  };

const addPaymentImage = async (userId, saleId, file) => {
    const connection = await db.getConnection();
    const remoteHost = process.env.REMOTE_HOST;
    const remoteUser = process.env.REMOTE_USER;
    const remotePassword = process.env.REMOTE_PASSWORD;
    const remotePath = process.env.REMOTE_PATH;
  
    try {
      await connection.beginTransaction();
  
     
      const [customer] = await connection.query(
        'SELECT id FROM tb_customer WHERE user_id = ?', 
        [userId]
      );
  
      if (customer.length === 0) {
        throw new Error('No se encontró un cliente asociado a este usuario.');
      }
  
      const customerId = customer[0].id;
  
      // Verificar que el sale_id pertenece al customer_id
      const [sale] = await connection.query(
        'SELECT id FROM tb_sales WHERE id = ? AND customer_id = ?',
        [saleId, customerId]
      );
  
      if (sale.length === 0) {
        throw new Error('Esta venta no pertenece a este cliente.');
      }
  
      // Insertar el nuevo voucher con type 'PAY'
      const voucherType = 'PAY';
      const voucherQuery = 'INSERT INTO tb_voucher (path, sale_id, type) VALUES (?, ?, ?)';
      const [voucherResult] = await connection.query(voucherQuery, ['', saleId, voucherType]);
      const voucherId = voucherResult.insertId;
  
      // Generar el nombre del archivo y subirlo al servidor remoto
      const fileName = processFileName(saleId, voucherId, file.originalname);
      const remoteFilePath = `${remotePath}/${fileName}`;
  
      await sftp.connect({
        host: remoteHost,
        username: remoteUser,
        password: remotePassword,
      });
      await sftp.put(file.buffer, remoteFilePath);
      sftp.end();
  
      // Actualizar el path del voucher
      await connection.query('UPDATE tb_voucher SET path = ? WHERE id = ?', [fileName, voucherId]);
  
      await connection.commit();
  
      return {
        message: 'Imagen de pago cargada exitosamente',
        data: {
          saleId,
          voucher_id: voucherId,
          voucher_path: fileName,
          type: voucherType
        }
      };
    } catch (err) {
      await connection.rollback();
      sftp.end();
      throw new Error('Error al cargar la imagen de pago: ' + err.message);
    } finally {
      connection.release();
    }
  };
  
const listSales = async (userId, role) => {
    try {
      let salesQuery;
      let salesParams;
  
      // Definir la consulta SQL en función del rol
      if (role === 'CUSTOMER') {
        salesQuery = `
          SELECT s.id as saleId, s.customer_id, s.amount, s.totalPrice, ds.product_id, ds.unitPrice, ds.igv, ds.unitExtent, ds.status, ds.subtotal
          FROM tb_sales s
          JOIN tb_detailSale ds ON s.id = ds.sale_id
          WHERE s.customer_id = (SELECT id FROM tb_customer WHERE user_id = ?)
        `;
        salesParams = [userId];
      } else if (role === 'PRODUCER') {
        salesQuery = `
          SELECT s.id as saleId, s.customer_id, s.amount, s.totalPrice, ds.product_id, ds.unitPrice, ds.igv, ds.unitExtent, ds.status, ds.subtotal
          FROM tb_sales s
          JOIN tb_detailSale ds ON s.id = ds.sale_id
          JOIN tb_products p ON ds.product_id = p.id
          WHERE p.producer_id = (SELECT id FROM tb_producers WHERE user_id = ?)
        `;
        salesParams = [userId];
      } else {
        throw new Error('Rol no autorizado para listar ventas.');
      }
  
      const [sales] = await db.query(salesQuery, salesParams);
  
      // Agregar los nombres de los vouchers según el tipo
      for (let sale of sales) {
        const [vouchers] = await db.query(
          'SELECT type, path FROM tb_voucher WHERE sale_id = ?',
          [sale.saleId]
        );
  
        sale.vouchers = {
          COMPROBANTE: vouchers.filter(v => v.type === 'COMPROBANTE').map(v => v.path),
          PAY: vouchers.filter(v => v.type === 'PAY').map(v => v.path)
        };
      }
  
      return sales;
    } catch (err) {
      throw new Error('Error al listar las ventas: ' + err.message);
    }
  };

const getSaleById = async (userId, role, saleId) => {
    try {
      let saleQuery;
      let saleParams;
  
      // Definir la consulta SQL en función del rol
      if (role === 'CUSTOMER') {
        saleQuery = `
          SELECT s.id as saleId, s.customer_id, s.amount, s.totalPrice, ds.product_id, ds.unitPrice, ds.igv, ds.unitExtent, ds.status, ds.subtotal
          FROM tb_sales s
          JOIN tb_detailSale ds ON s.id = ds.sale_id
          WHERE s.id = ? AND s.customer_id = (SELECT id FROM tb_customer WHERE user_id = ?)
        `;
        saleParams = [saleId, userId];
      } else if (role === 'PRODUCER') {
        saleQuery = `
          SELECT s.id as saleId, s.customer_id, s.amount, s.totalPrice, ds.product_id, ds.unitPrice, ds.igv, ds.unitExtent, ds.status, ds.subtotal
          FROM tb_sales s
          JOIN tb_detailSale ds ON s.id = ds.sale_id
          JOIN tb_products p ON ds.product_id = p.id
          WHERE s.id = ? AND p.producer_id = (SELECT id FROM tb_producers WHERE user_id = ?)
        `;
        saleParams = [saleId, userId];
      } else {
        throw new Error('Rol no autorizado para ver esta venta.');
      }
  
      const [sales] = await db.query(saleQuery, saleParams);
  
      if (sales.length === 0) {
        throw new Error('Venta no encontrada o no tiene permiso para verla.');
      }
  
      let sale = sales[0];
  
      // Agregar los nombres de los vouchers según el tipo
      const [vouchers] = await db.query(
        'SELECT type, path FROM tb_voucher WHERE sale_id = ?',
        [sale.saleId]
      );
  
      sale.vouchers = {
        COMPROBANTE: vouchers.filter(v => v.type === 'COMPROBANTE').map(v => v.path),
        PAY: vouchers.filter(v => v.type === 'PAY').map(v => v.path)
      };
  
      return sale;
    } catch (err) {
      throw new Error('Error al obtener la venta: ' + err.message);
    }
  };
  
const deleteSale = async (userId, role, saleId) => {
    if (role !== 'PRODUCER') {
      throw new Error('Solo los productores pueden eliminar ventas.');
    }
  
    const connection = await db.getConnection();
  
    try {
      await connection.beginTransaction();
  
      // Verificar que el sale_id pertenece al producer
      const [sale] = await connection.query(
        `SELECT s.id
         FROM tb_sales s
         JOIN tb_detailSale ds ON s.id = ds.sale_id
         JOIN tb_products p ON ds.product_id = p.id
         WHERE s.id = ? AND p.producer_id = (SELECT id FROM tb_producers WHERE user_id = ?)`,
        [saleId, userId]
      );
  
      if (sale.length === 0) {
        throw new Error('Esta venta no pertenece a este productor o no existe.');
      }
  
      // Eliminar los vouchers asociados a la venta
      await connection.query('DELETE FROM tb_voucher WHERE sale_id = ?', [saleId]);
  
      // Eliminar los detalles de la venta
      await connection.query('DELETE FROM tb_detailSale WHERE sale_id = ?', [saleId]);
  
      // Eliminar la venta
      await connection.query('DELETE FROM tb_sales WHERE id = ?', [saleId]);
  
      await connection.commit();
  
      return { message: 'Venta eliminada exitosamente.' };
    } catch (err) {
      await connection.rollback();
      throw new Error('Error al eliminar la venta: ' + err.message);
    } finally {
      connection.release();
    }
  };
  

module.exports = { createSale, updateSale, addPaymentImage, listSales,getSaleById, deleteSale};
