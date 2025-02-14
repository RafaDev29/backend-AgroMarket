const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function checkConnection() {
  try {
    const connection = await pool.promise().getConnection(); // Usamos `.promise()` aquí
    console.log('✅ Conectado a la base de datos correctamente');

    connection.release(); // Liberamos la conexión si se estableció
  } catch (error) {
    console.error('❌ Error al conectar a la base de datos:', error);
  }
}

// Llamar a la función de prueba de conexión
checkConnection();

module.exports = pool.promise();
