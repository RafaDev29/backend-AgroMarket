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

    // Insertar el producto en la tabla tb_products, incluyendo bulk_price y bulk_quantity
    const productQuery = `
      INSERT INTO tb_products (name, description, category_id, price, bulk_price, bulk_quantity, stock, unitExtent, producer_id) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const productValues = [
      data.name,
      data.description,
      data.category_id,
      parseFloat(data.price),           // Asegurarse de que price sea numérico
      parseFloat(data.bulk_price) || null,  // Convertir bulk_price a número flotante
      data.bulk_quantity || null,      // bulk_quantity sigue siendo un entero
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

    // Listar los productos del producer junto con sus imágenes y unitExtentId
    const [products] = await db.query(`
      SELECT 
        p.id AS productId, 
        p.name, 
        p.description, 
        p.category_id, 
        p.price, 
        p.bulk_price,       -- Añadir bulk_price
        p.bulk_quantity,    -- Añadir bulk_quantity
        p.stock, 
        p.unitExtent,
        e.id AS unitExtentId
      FROM tb_products p
      LEFT JOIN tb_extend e ON p.unitExtent = e.name
      WHERE p.producer_id = ?
    `, [producerId]);

    // Agregar las imágenes de cada producto
    for (let product of products) {
      const [images] = await db.query('SELECT path FROM tb_image WHERE product_id = ?', [product.productId]);
      product.images = images.map(img => img.path);
    }

    return products.map(product => ({
      productId: product.productId,
      name: product.name,
      description: product.description,
      category_id: product.category_id,
      price: product.price,
      bulk_price: product.bulk_price,        
      bulk_quantity: product.bulk_quantity,  
      stock: product.stock,
      unitExtent: product.unitExtent,
      unitExtentId: product.unitExtentId,

      images: product.images
    }));
  } catch (err) {
    throw new Error('Error retrieving products: ' + err.message);
  }
};


const listAllProducts = async () => {
  try {
    // Consultar todos los productos junto con sus detalles, detalles del productor y unitExtentId
    const [products] = await db.query(`
      SELECT 
        p.id AS productId, 
        p.name, 
        p.description, 
        p.category_id, 
        p.price, 
        p.bulk_price,       -- Añadir bulk_price
        p.bulk_quantity,    -- Añadir bulk_quantity
        p.stock, 
        p.unitExtent,
        pr.bussinesName AS producerBussinesName,
        pr.phone AS producerPhone,
        e.id AS unitExtentId
      FROM tb_products p
      JOIN tb_producers pr ON p.producer_id = pr.id
      LEFT JOIN tb_extend e ON p.unitExtent = e.name
    `);

    // Agregar las imágenes de cada producto
    for (let product of products) {
      const [images] = await db.query('SELECT path FROM tb_image WHERE product_id = ?', [product.productId]);
      product.images = images.map(img => img.path);
    }

    // Formatear los datos de los productos con sus productores en un objeto
    const formattedProducts = products.map(product => ({
      productId: product.productId,
      name: product.name,
      description: product.description,
      category_id: product.category_id,
      price: product.price,
      bulk_price: product.bulk_price,         // Añadir bulk_price al formato de salida
      bulk_quantity: product.bulk_quantity,   // Añadir bulk_quantity al formato de salida
      stock: product.stock,
      unitExtent: product.unitExtent,
      unitExtentId: product.unitExtentId, // Agrega el unitExtentId al objeto
      producer: {
        bussinesName: product.producerBussinesName,
        phone: product.producerPhone
      },
      images: product.images
    }));

    return formattedProducts;
  } catch (err) {
    throw new Error('Error al obtener los productos: ' + err.message);
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
  SET name = ?, description = ?, category_id = ?, price = ?, bulk_price = ?, bulk_quantity = ?, stock = ?, unitExtent = ? 
  WHERE id = ?`;
  const updateValues = [
    data.name,
    data.description,
    data.category_id,
    data.price,
    data.bulk_price || null,       
    data.bulk_quantity || null,    
    data.stock,
    data.unitExtent,
    productId
  ];

    await connection.query(updateQuery, updateValues);

    // Manejar nuevas imágenes si se incluyen en la solicitud
    let newImageNames = [];

    if (files && files.length > 0) {
      // Conectar al servidor remoto para subir nuevas imágenes
      await sftp.connect({
        host: remoteHost,
        username: remoteUser,
        password: remotePassword
      });

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
    }

    await connection.commit();

    // Obtener todas las imágenes del producto, incluidas las nuevas
    const [allImages] = await connection.query('SELECT path FROM tb_image WHERE product_id = ?', [productId]);
    const allImageNames = allImages.map(image => image.path);

    return {
      productId,
      ...data,
      images: allImageNames // Devolver todas las imágenes, incluidas las nuevas
    };
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

const getProductById = async (productId) => {
  try {
    // Consulta para obtener los detalles del producto y del productor asociado
    const [product] = await db.query(`
      SELECT 
        p.id AS productId, 
        p.name, 
        p.description, 
        p.category_id, 
        p.price, 
        p.bulk_price,       
        p.bulk_quantity,    
        p.stock, 
        p.unitExtent,
        pr.bussinesName AS producerBussinesName,
        pr.phone AS producerPhone
      FROM tb_products p
      JOIN tb_producers pr ON p.producer_id = pr.id
      WHERE p.id = ?
    `, [productId]);

    if (product.length === 0) {
      throw new Error('Producto no encontrado');
    }

    // Agrupar los datos del productor en un objeto
    return {
      productId: product[0].productId,
      name: product[0].name,
      description: product[0].description,
      category_id: product[0].category_id,
      price: product[0].price,
      bulk_price: product[0].bulk_price,         
      bulk_quantity: product[0].bulk_quantity,   
      stock: product[0].stock,
      unitExtent: product[0].unitExtent,
      producer: {
        bussinesName: product[0].producerBussinesName,
        phone: product[0].producerPhone
      }
    };
  } catch (err) {
    throw new Error('Error al obtener el producto: ' + err.message);
  }
};


module.exports = { createProduct, listProductsByProducer, listAllProducts, updateProduct, deleteProduct, getProductById };
