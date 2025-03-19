const sql = require('mssql');

// Configuración de conexión
const config = {
    user: 'sa', 
    password: 'Adm@2487', 
    server: '192.168.100.50', // Nombre del servidor 
    database: 'H2O_BELEN', // Nombre de base de datos
    options: {
        encrypt: false, // Cambiar a true si se necesita una conexión encriptad
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
