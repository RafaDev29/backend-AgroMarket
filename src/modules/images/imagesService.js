
const db = require('../../config/db');
const Client = require('ssh2-sftp-client');
const sftp = new Client();

const getImageUrl = (imageName) => {
    const baseURL = 'http://143.244.144.235/images/';
    return baseURL + imageName;
  };
  


  const deleteImages = async (imageIds, productId) => {
    const connection = await db.getConnection();
    const remoteHost = process.env.REMOTE_HOST;
    const remoteUser = process.env.REMOTE_USER;
    const remotePassword = process.env.REMOTE_PASSWORD;
    const remotePath = process.env.REMOTE_PATH;
  
    try {
      await connection.beginTransaction();
  
      // Verificar que las imágenes pertenecen al producto dado
      const [images] = await connection.query(`
        SELECT id, path 
        FROM tb_image 
        WHERE id IN (?) AND product_id = ?`, 
        [imageIds, productId]
      );
  
      if (images.length === 0) {
        throw new Error('No se encontraron imágenes que correspondan al producto especificado.');
      }
  
      // Conectar al servidor remoto para eliminar las imágenes
      await sftp.connect({
        host: remoteHost,
        username: remoteUser,
        password: remotePassword
      });
  
      for (const image of images) {
        const remoteFilePath = `${remotePath}/${image.path}`;
        await sftp.delete(remoteFilePath); // Eliminar la imagen del servidor
        await connection.query('DELETE FROM tb_image WHERE id = ?', [image.id]); // Eliminar la referencia de la base de datos
      }
  
      sftp.end();
      await connection.commit();
  
      return {
        status: true,
        message: `${images.length} imagen(es) eliminada(s) correctamente.`,
      };
    } catch (err) {
      await connection.rollback();
      sftp.end();
      throw new Error(err.message);
    } finally {
      connection.release();
    }
  };
  

  const listImagesByProduct = async (productId) => {
    const connection = await db.getConnection();
  
    try {
      const [images] = await connection.query(`
        SELECT id, product_id, path 
        FROM tb_image 
        WHERE product_id = ?`, 
        [productId]
      );
  
      return {
        status: true,
        images: images,
      };
    } catch (err) {
      throw new Error(err.message);
    } finally {
      connection.release();
    }
  };
  
  module.exports = { deleteImages , getImageUrl, listImagesByProduct};