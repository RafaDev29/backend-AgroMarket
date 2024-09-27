const db = require('../../config/db');
const CryptoJS = require('crypto-js');
const jwt = require('jsonwebtoken');
const userStorage = require('./jwt/userStorage');
const secretKey = process.env.JWT_SECRET_KEY;

const login = async (username, password) => {
  try {
    // Buscar el usuario en la base de datos
    const [user] = await db.query('SELECT * FROM tb_user WHERE username = ?', [username]);

    if (user.length === 0) {
      throw new Error('Usuario o contraseña invalido');
    }

    // Desencriptar la contraseña almacenada y compararla con la proporcionada
    const decryptedPassword = CryptoJS.AES.decrypt(user[0].password, process.env.SECRET_KEY).toString(CryptoJS.enc.Utf8);
    if (decryptedPassword !== password) {
      throw new Error('Usuario o contraseña invalido');
    }

    // Objeto de respuesta inicial con direction como cadena vacía
    let response = {
      userId: user[0].id,
      username: user[0].username,
      role: user[0].role,
      direction: ""  // Campo direction con valor por defecto ""
    };

    // Si el rol es CUSTOMER, buscar el campo direction en tb_customer
    if (user[0].role === 'CUSTOMER') {
      const [customerData] = await db.query('SELECT direction FROM tb_customer WHERE user_id = ?', [user[0].id]);
      if (customerData.length > 0) {
        response.direction = customerData[0].direction; // Reemplazar con la dirección del cliente
      }
    }

    // Generar el token JWT
    const token = jwt.sign(
      {
        userId: user[0].id,
        username: user[0].username,
        role: user[0].role,
      },
      secretKey,
      { expiresIn: '24h' }
    );

    // Agregar el token a la respuesta
    response.token = token;

    // Almacenar los datos del usuario (sin la contraseña)
    userStorage.setUser({
      userId: user[0].id,
      username: user[0].username,
      role: user[0].role,
    });

    return response;  // Devolver el objeto de respuesta con direction como "" si no es CUSTOMER
  } catch (err) {
    throw new Error(err.message);
  }
};



module.exports = { login };
