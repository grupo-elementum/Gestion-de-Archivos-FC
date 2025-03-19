const { poolPromise } = require('./models/database'); // Importa tu configuración de conexión

async function testConnection() {
    try {
        const pool = await poolPromise; // Conexión a la base de datos
        const result = await pool.request().query('SELECT TOP 1 * FROM dbo.CLIENTES'); // Consulta de prueba
        console.log('Conexión exitosa. Datos de ejemplo:', result.recordset);
    } catch (err) {
        console.error('Error al conectar a la base de datos:', err);
    }
}

testConnection(); // Llama la función

