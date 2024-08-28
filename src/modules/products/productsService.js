const db = require('../../config/db');
const Client = require('ssh2-sftp-client');
const sftp = new Client();


const processFileName = (productId, imageId, productName, originalName) => {
  const sanitizedProductName = productName.replace(/\s+/g, '-').toLowerCase(); // Reemplaza espacios y convierte a minúsculas
  const extension = originalName.split('.').pop(); // Obtiene la extensión del archivo
  return `${productId}-${imageId}-${sanitizedProductName}.${extension}`; // Genera el nuevo nombre de archivo
};

const createProduct = async (data, userId, files) => {
  const connection = await db.getConnection();
  const remoteHost = process.env.REMOTE_HOST;
  const remoteUser = process.env.REMOTE_USER;
  const remotePassword = process.env.REMOTE_PASSWORD;
  const remotePath = process.env.REMOTE_PATH;

  try {
    await connection.beginTransaction();

    // Buscar el producer_id usando el user_id del token
    const [producer] = await connection.query('SELECT id FROM tb_producers WHERE user_id = ?', [userId]);

    if (producer.length === 0) {
      throw new Error('Producer not found');
    }

    const producerId = producer[0].id;

    // Insertar el producto en la tabla tb_products
    const productQuery = `
      INSERT INTO tb_products (name, description, category_id, price, stock, unitExtent, producer_id) 
      VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const productValues = [
      data.name, 
      data.description, 
      data.category_id, 
      data.price, 
      data.stock, 
      data.unitExtent, 
      producerId
    ];
    const [result] = await connection.query(productQuery, productValues);

    const productId = result.insertId;
    const imageNames = [];

    // Subir cada archivo al servidor remoto y almacenar la información en la base de datos
    await sftp.connect({
      host: remoteHost,
      username: remoteUser,
      password: remotePassword
    });

    for (const file of files) {
      // Insertar primero la entrada de la imagen para obtener el imageId
      const imageQuery = 'INSERT INTO tb_image (product_id, path) VALUES (?, ?)';
      const [imageResult] = await connection.query(imageQuery, [productId, '']);

      const imageId = imageResult.insertId;
      const newFileName = processFileName(productId, imageId, data.name, file.originalname);
      const remoteFilePath = `${remotePath}/${newFileName}`;
      await sftp.put(file.buffer, remoteFilePath);

      // Actualizar la entrada de la imagen con el nombre de archivo correcto
      await connection.query('UPDATE tb_image SET path = ? WHERE id = ?', [newFileName, imageId]);

      imageNames.push(newFileName);
    }

    await connection.commit();
    sftp.end();

    return {
      productId,
      ...data,
      images: imageNames
    };
  } catch (err) {
    await connection.rollback();
    sftp.end();
    throw new Error(err.message);
  } finally {
    connection.release();
  }
};

const listProductsByProducer = async (userId) => {
  try {
    // Obtener el producer_id utilizando el user_id
    const [producer] = await db.query('SELECT id FROM tb_producers WHERE user_id = ?', [userId]);

    if (producer.length === 0) {
      throw new Error('Producer not found');
    }

    const producerId = producer[0].id;

    // Listar los productos del producer
    const [products] = await db.query('SELECT * FROM tb_products WHERE producer_id = ?', [producerId]);

    return products;
  } catch (err) {
    throw new Error('Error retrieving products: ' + err.message);
  }
};

const listAllProducts = async () => {
  try {
    // Listar todos los productos
    const [products] = await db.query('SELECT * FROM tb_products');

    return products;
  } catch (err) {
    throw new Error('Error retrieving products: ' + err.message);
  }
};

const updateProduct = async (productId, data, userId, files) => {
  const connection = await db.getConnection();
  const remoteHost = process.env.REMOTE_HOST;
  const remoteUser = process.env.REMOTE_USER;
  const remotePassword = process.env.REMOTE_PASSWORD;
  const remotePath = process.env.REMOTE_PATH;

  try {
    await connection.beginTransaction();

    // Verificar si el producto pertenece al productor autenticado
    const [product] = await connection.query(`
      SELECT p.id, p.producer_id 
      FROM tb_products p 
      JOIN tb_producers pr ON p.producer_id = pr.id 
      WHERE p.id = ? AND pr.user_id = ?`, 
      [productId, userId]
    );

    if (product.length === 0) {
      throw new Error('This product does not belong to you or does not exist');
    }

    // Actualizar los demás campos del producto en la base de datos
    const updateQuery = `
      UPDATE tb_products 
      SET name = ?, description = ?, category_id = ?, price = ?, stock = ?, unitExtent = ? 
      WHERE id = ?`;
    const updateValues = [
      data.name, 
      data.description, 
      data.category_id, 
      data.price, 
      data.stock, 
      data.unitExtent, 
      productId
    ];

    await connection.query(updateQuery, updateValues);

    // Manejar imágenes si se incluyen en la solicitud
    if (files && files.length > 0) {
      // Eliminar imágenes antiguas si se suben nuevas imágenes
      const [oldImages] = await connection.query('SELECT path FROM tb_image WHERE product_id = ?', [productId]);
      
      // Conectar al servidor remoto para eliminar archivos antiguos y subir nuevos
      await sftp.connect({
        host: remoteHost,
        username: remoteUser,
        password: remotePassword
      });

      for (const oldImage of oldImages) {
        const remoteFilePath = `${remotePath}/${oldImage.path}`;
        await sftp.delete(remoteFilePath); // Eliminar la imagen antigua del servidor
        await connection.query('DELETE FROM tb_image WHERE product_id = ? AND path = ?', [productId, oldImage.path]); // Eliminar referencia de la base de datos
      }

      const newImageNames = [];

      for (const file of files) {
        const imageQuery = 'INSERT INTO tb_image (product_id, path) VALUES (?, ?)';
        const [imageResult] = await connection.query(imageQuery, [productId, '']);

        const imageId = imageResult.insertId;
        const newFileName = processFileName(productId, imageId, data.name, file.originalname);
        const remoteFilePath = `${remotePath}/${newFileName}`;
        await sftp.put(file.buffer, remoteFilePath);

        // Actualizar la entrada de la imagen con el nombre de archivo correcto
        await connection.query('UPDATE tb_image SET path = ? WHERE id = ?', [newFileName, imageId]);

        newImageNames.push(newFileName);
      }

      sftp.end();

      await connection.commit();
      return {
        productId,
        ...data,
        images: newImageNames
      };
    } else {
      // Si no se incluyen imágenes, solo actualiza los campos y no toques las imágenes existentes
      await connection.commit();
      return {
        productId,
        ...data,
        images: null // No se han cambiado las imágenes
      };
    }
  } catch (err) {
    await connection.rollback();
    sftp.end();
    throw new Error(err.message);
  } finally {
    connection.release();
  }
};

const deleteProduct = async (productId, userId) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Verificar si el producto pertenece al productor autenticado
    const [product] = await connection.query(`
      SELECT p.id, p.producer_id 
      FROM tb_products p 
      JOIN tb_producers pr ON p.producer_id = pr.id 
      WHERE p.id = ? AND pr.user_id = ?`, 
      [productId, userId]
    );

    if (product.length === 0) {
      throw new Error('This product does not belong to you or does not exist');
    }

    // Eliminar el producto de la base de datos
    await connection.query('DELETE FROM tb_products WHERE id = ?', [productId]);

    await connection.commit();

    return { message: 'Product deleted successfully' };
  } catch (err) {
    await connection.rollback();
    throw new Error(err.message);
  } finally {
    connection.release();
  }
};

module.exports = { createProduct , listProductsByProducer, listAllProducts, updateProduct, deleteProduct};
