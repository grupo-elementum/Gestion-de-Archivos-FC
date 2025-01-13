const sql = require('mssql');

// Configuración de conexión
const config = {
    user: 'sa', 
    password: '2487', 
    server: 'LAPTOP-FC50Q5G3\\SQLSTANDARD2019', // Nombre del servidor 
    database: 'H2O_RENZI', // Nombre de base de datos
    options: {
        encrypt: false, // Cambiar a true si se necesita una conexión encriptada
        enableArithAbort: true
    }
};

// Crear y exportar la conexión
const poolPromise = new sql.ConnectionPool(config)
    .connect()
    .then(pool => {
        console.log('Conexión exitosa a la base de datos FrioCalor');
        return pool;
    })
    .catch(err => {
        console.error('Error al conectar a la base de datos:', err);
    });

module.exports = {
    sql,
    poolPromise
};
