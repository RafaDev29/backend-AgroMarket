
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

    // Verificar que el extend_id existe en la tabla tb_extend
    const [extend] = await connection.query('SELECT id, name FROM tb_extend WHERE id = ?', [data.extend_id]);
    if (extend.length === 0) {
      throw new Error('La unidad de medida no es válida');
    }

    const unitName = extend[0].name.toLowerCase(); // Convertimos a minúsculas
    console.log('Unidad seleccionada por el cliente (unitName):', unitName);

    const [customer] = await connection.query('SELECT id FROM tb_customer WHERE user_id = ?', [user_id]);
    if (customer.length === 0) {
      throw new Error('El cliente no existe');
    }

    const customerId = customer[0].id;
    console.log('Customer ID:', customerId);

    const [product] = await connection.query('SELECT price, unitExtent FROM tb_products WHERE id = ?', [data.product_id]);
    if (product.length === 0) {
      throw new Error('El producto no existe');
    }

    const unitPrice = parseFloat(product[0].price);
    const productUnit = product[0].unitExtent.toLowerCase(); // Convertimos a minúsculas
    console.log('Unidad de medida del producto (productUnit):', productUnit);
    console.log('Precio unitario del producto (unitPrice):', unitPrice);

    let subtotal;

    // Verificar si la unidad seleccionada es diferente a la del producto
    if (unitName === "tn" && productUnit === "kg") {
      subtotal = unitPrice * 1000 * data.amount; // Convertir toneladas a kilogramos
      console.log('Subtotal calculado (con conversión de Tn a kg):', subtotal);
    } else if (unitName === productUnit) {
      subtotal = unitPrice * data.amount; // No es necesaria la conversión
      console.log('Subtotal calculado (sin conversión, unidades coinciden):', subtotal);
    } else {
      throw new Error('Las unidades de medida no coinciden o la conversión no está soportada.');
    }

    const igv = subtotal * 0.18;
    const totalPrice = subtotal + igv;
    console.log('IGV calculado:', igv);
    console.log('Precio total calculado (totalPrice):', totalPrice);

    const saleQuery = 'INSERT INTO tb_sales (customer_id, amount, totalPrice) VALUES (?, ?, ?)';
    const saleValues = [customerId, data.amount, totalPrice];
    const [saleResult] = await connection.query(saleQuery, saleValues);

    const saleId = saleResult.insertId;
    console.log('Sale ID:', saleId);

    // Guardar los detalles de la venta
    const detailQuery = 'INSERT INTO tb_detailSale (sale_id, product_id, unitPrice, igv, extend_id, voucher_id, status, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
    const detailValues = [saleId, data.product_id, unitPrice, igv, data.extend_id, null, 'solicitado', subtotal];
    await connection.query(detailQuery, detailValues);
    console.log('Detalle de la venta guardado con valores:', detailValues);

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
  
      // Validar que el estado no retroceda
      const validTransitions = {
        'solicitado': ['activo', 'aprobado'],
        'activo': ['aprobado', 'culminado'],
        'aprobado': ['culminado'],
        'culminado': []
      };

      if (!validTransitions[currentStatus].includes(data.status)) {
        throw new Error(`No se puede cambiar el estado de "${currentStatus}" a "${data.status}".`);
      }
  
      let voucherId = details[0].voucher_id;
      let fileName = null;
  
      if (file) {
        const voucherType = 'COMPROBANTE';
  
        fileName = processFileName(saleId, voucherId || 0, file.originalname);
  
        if (!voucherId) {
          const voucherQuery = 'INSERT INTO tb_voucher (path, sale_id, type) VALUES (?, ?, ?)';
          const [voucherResult] = await connection.query(voucherQuery, [fileName, saleId, voucherType]);
          voucherId = voucherResult.insertId;
        } else {
          const updateVoucherQuery = 'UPDATE tb_voucher SET path = ?, type = ? WHERE id = ?';
          await connection.query(updateVoucherQuery, [fileName, voucherType, voucherId]);
        }
  
        const remoteFilePath = `${remotePath}/${fileName}`;
  
        await sftp.connect({
          host: remoteHost,
          username: remoteUser,
          password: remotePassword,
        });
        await sftp.put(file.buffer, remoteFilePath);
        sftp.end();
  
        await connection.query('UPDATE tb_detailSale SET voucher_id = ? WHERE sale_id = ?', [voucherId, saleId]);
      }
  
      if (data.status) {
        // Si la venta ya estaba aprobada o culminado, permitir la edición pero no modificar el stock
        if (currentStatus === 'aprobado' || currentStatus === 'culminado') {
          await connection.query('UPDATE tb_detailSale SET status = ? WHERE sale_id = ?', [data.status, saleId]);
          await connection.commit();

          return {
            saleId,
            message: 'La venta ya está aprobada, se ha actualizado el voucher.',
            data: {
              saleId,
              status: data.status,
              voucher_id: voucherId,
              voucher_path: fileName,
              product_id: details[0].product_id,
              unitPrice: details[0].unitPrice,
              igv: details[0].igv,
              unitExtent: details[0].unitExtent,
              subtotal: details[0].subtotal
            }
          };
        }

        const updateStatusQuery = 'UPDATE tb_detailSale SET status = ? WHERE sale_id = ?';
        await connection.query(updateStatusQuery, [data.status, saleId]);
  
        // Si el status es "aprobado", reducir el stock del producto usando `amount`
        if (data.status === 'aprobado') {
          const [saleDetails] = await connection.query('SELECT amount FROM tb_sales WHERE id = ?', [saleId]);
          const amountSold = parseFloat(saleDetails[0].amount);
          if (isNaN(amountSold)) {
            throw new Error('El valor de amount no es válido.');
          }

          // Obtener el unitExtent del producto para verificar la unidad y el stock
          const [product] = await connection.query('SELECT unitExtent, stock FROM tb_products WHERE id = ?', [details[0].product_id]);
          const productUnit = product[0].unitExtent.toLowerCase();
          const currentStock = parseFloat(product[0].stock);

          // Obtener el extend_id usado en la venta
          const [extend] = await connection.query('SELECT name FROM tb_extend WHERE id = ?', [details[0].extend_id]);
          const saleUnit = extend[0].name.toLowerCase();

          let adjustedAmount;

          if (saleUnit === "tn" && productUnit === "kg") {
            adjustedAmount = amountSold * 1000; // Convertir toneladas a kilogramos
          } else if (saleUnit === productUnit) {
            adjustedAmount = amountSold; // No es necesaria la conversión
          } else {
            throw new Error('Las unidades de medida no coinciden o la conversión no está soportada.');
          }

          console.log('Stock antes de la reducción:', currentStock);
          console.log('Cantidad a reducir del stock:', adjustedAmount);

          // Validar si el stock es suficiente
          if (adjustedAmount > currentStock) {
            throw new Error('Stock insuficiente para la cantidad seleccionada.');
          }

          const newStock = currentStock - adjustedAmount;
          const updateProductStockQuery = 'UPDATE tb_products SET stock = ? WHERE id = ?';
          await connection.query(updateProductStockQuery, [newStock, details[0].product_id]);

          console.log('Nuevo stock después de la reducción:', newStock);
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
      let roleCondition;
  
      // Definir la condición de consulta SQL en función del rol
      if (role === 'CUSTOMER') {
        roleCondition = `s.customer_id = (SELECT id FROM tb_customer WHERE user_id = ?)`;
      } else if (role === 'PRODUCER') {
        roleCondition = `p.producer_id = (SELECT id FROM tb_producers WHERE user_id = ?)`;
      } else {
        throw new Error('Rol no autorizado para listar ventas.');
      }
  
      // Consulta SQL común
      const salesQuery = `
        SELECT s.id as saleId, s.customer_id, s.amount, s.totalPrice, ds.product_id, ds.unitPrice, ds.igv, ds.extend_id, ds.status, ds.subtotal,
               p.name as productName, p.description as productDescription, p.category_id, p.price as productPrice, p.stock, p.unitExtent, 
               c.firstName as customerFirstName, c.lastName as customerLastName, c.bussinesName, c.phone, c.document,
               e.name as unitName
        FROM tb_sales s
        JOIN tb_detailSale ds ON s.id = ds.sale_id
        JOIN tb_products p ON ds.product_id = p.id
        JOIN tb_customer c ON s.customer_id = c.id
        JOIN tb_extend e ON ds.extend_id = e.id
        WHERE ${roleCondition}
      `;
  
      const salesParams = [userId];
      const [sales] = await db.query(salesQuery, salesParams);
  
      for (let sale of sales) {
        // Obtener los nombres de los vouchers
        const [vouchers] = await db.query(
          'SELECT type, path FROM tb_voucher WHERE sale_id = ?',
          [sale.saleId]
        );
        sale.vouchers = {
          COMPROBANTE: vouchers.filter(v => v.type === 'COMPROBANTE').map(v => v.path),
          PAY: vouchers.filter(v => v.type === 'PAY').map(v => v.path)
        };
  
        // Organizar los datos del producto, cliente, y unidad de medida en objetos
        sale.product = {
          id: sale.product_id,
          name: sale.productName,
          description: sale.productDescription,
          category_id: sale.category_id,
          price: sale.productPrice,
          stock: sale.stock,
          unitExtent: sale.unitExtent
        };
  
        // Obtener las imágenes del producto
        const [images] = await db.query(
          'SELECT path FROM tb_image WHERE product_id = ?',
          [sale.product.id]
        );
        sale.product.images = images.map(img => img.path);
  
        sale.customer = {
          id: sale.customer_id,
          firstName: sale.customerFirstName,
          lastName: sale.customerLastName,
          bussinesName: sale.bussinesName,
          phone: sale.phone,
          document: sale.document
        };
  
        sale.unit = {
          id: sale.extend_id,
          name: sale.unitName
        };
  
        // Eliminar los campos redundantes
        const redundantFields = [
          'product_id', 'productName', 'productDescription', 'category_id', 'productPrice', 'stock', 'unitExtent',
          'customerFirstName', 'customerLastName', 'bussinesName', 'phone', 'document',
          'extend_id', 'unitName'
        ];
        redundantFields.forEach(field => delete sale[field]);
      }
  
      return sales;
    } catch (err) {
      throw new Error('Error al listar las ventas: ' + err.message);
    }
  };
  
  const getSaleById = async (userId, role, saleId) => {
    try {
      let saleQuery;
      let roleCondition;
      
      // Definir la condición de consulta SQL en función del rol
      if (role === 'CUSTOMER') {
        roleCondition = `s.customer_id = (SELECT id FROM tb_customer WHERE user_id = ?)`;
      } else if (role === 'PRODUCER') {
        roleCondition = `p.producer_id = (SELECT id FROM tb_producers WHERE user_id = ?)`;
      } else {
        throw new Error('Rol no autorizado para ver esta venta.');
      }
  
      // Consulta SQL
      saleQuery = `
        SELECT s.id as saleId, s.customer_id, s.amount, s.totalPrice, ds.product_id, ds.unitPrice, ds.igv, ds.extend_id, ds.status, ds.subtotal,
               p.name as productName, p.description as productDescription, p.category_id, p.price as productPrice, p.stock, p.unitExtent, 
               c.firstName as customerFirstName, c.lastName as customerLastName, c.bussinesName, c.phone, c.document,
               e.name as unitName
        FROM tb_sales s
        JOIN tb_detailSale ds ON s.id = ds.sale_id
        JOIN tb_products p ON ds.product_id = p.id
        JOIN tb_customer c ON s.customer_id = c.id
        JOIN tb_extend e ON ds.extend_id = e.id
        WHERE s.id = ? AND ${roleCondition}
      `;
  
      const saleParams = [saleId, userId];
      const [sales] = await db.query(saleQuery, saleParams);
  
      if (sales.length === 0) {
        throw new Error('Venta no encontrada o no tiene permiso para verla.');
      }
  
      let sale = sales[0];
  
      // Obtener los nombres de los vouchers
      const [vouchers] = await db.query(
        'SELECT type, path FROM tb_voucher WHERE sale_id = ?',
        [sale.saleId]
      );
  
      sale.vouchers = {
        COMPROBANTE: vouchers.filter(v => v.type === 'COMPROBANTE').map(v => v.path),
        PAY: vouchers.filter(v => v.type === 'PAY').map(v => v.path)
      };
  
      // Organizar los datos del producto, cliente, y unidad de medida en objetos
      sale.product = {
        id: sale.product_id,
        name: sale.productName,
        description: sale.productDescription,
        category_id: sale.category_id,
        price: sale.productPrice,
        stock: sale.stock,
        unitExtent: sale.unitExtent
      };
  
      // Obtener las imágenes del producto
      const [images] = await db.query(
        'SELECT path FROM tb_image WHERE product_id = ?',
        [sale.product.id]
      );
  
      sale.product.images = images.map(img => img.path);
  
      sale.customer = {
        id: sale.customer_id,
        firstName: sale.customerFirstName,
        lastName: sale.customerLastName,
        bussinesName: sale.bussinesName,
        phone: sale.phone,
        document: sale.document
      };
  
      sale.unit = {
        id: sale.extend_id,
        name: sale.unitName
      };
  
      // Eliminar campos redundantes
      const redundantFields = [
        'product_id', 'productName', 'productDescription', 'category_id', 'productPrice', 'stock', 'unitExtent',
        'customerFirstName', 'customerLastName', 'bussinesName', 'phone', 'document',
        'extend_id', 'unitName'
      ];
      redundantFields.forEach(field => delete sale[field]);
  
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
