const { poolPromise } = require('../models/database'); // Conexión a la base de datos

async function deletePreviousData(sheetData) {
    try {
        const pool = await poolPromise; // Conexión a la base de datos
        const transaction = pool.transaction();
        await transaction.begin();

        // Iterar sobre las filas para borrar datos relacionados
        for (const row of sheetData) {
            const nroSerie = String(row.nro_serie); // Asegurar que sea tratado como STRING

            await transaction.request()
                .input('NroSerie', nroSerie)
                .query(`
                    DELETE FROM EquiposFC WHERE Nro_Serie = @NroSerie;
                `);
        }

        await transaction.commit();
        console.log('Datos previos eliminados correctamente.');
    } catch (error) {
        console.error('Error al borrar datos previos:', error);
        throw error;
    }
}

module.exports = deletePreviousData;
