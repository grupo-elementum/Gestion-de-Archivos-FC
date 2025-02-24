const sql = require("mssql");
const fs = require("fs");
const path = require("path");
const xlsx = require("xlsx");
const { poolPromise } = require("../models/database"); // Conexión a la base de datos
const deletePreviousData = require("./deletePreviousData"); // Función interna para el borrado de datos
const { error } = require("console");


// Función para previsualizar los datos del archivo subido
async function previewFile(req, res) {
  let filePath;
  // Definir expectedColumns fuera del try para que esté disponible en el catch
  const expectedColumns = [
    "IdCliente", "Marca", "Marca_nueva", "Modelo", "Modelo_nuevo",
    "Nro_Serie", "IdProducto", "idubicacion", "idestado", "IdServicio", "Fecha_Desde"
  ];

  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: "No se subió ningún archivo.",
        details: `Columnas requeridas: ${expectedColumns.join(", ")}` 
      });
    }

    filePath = path.join(__dirname, "../uploads", req.file.filename);
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const sheetData = xlsx.utils.sheet_to_json(sheet);

    // Validar columnas
    const actualColumns = Object.keys(sheetData[0] || {});
    const isValid = expectedColumns.every(col => actualColumns.includes(col)) 
                    && actualColumns.length === expectedColumns.length;

    if (!isValid) {
      throw new Error("Archivo rechazado: Estructura de columnas incorrecta");
    }

    fs.unlinkSync(filePath);
    res.status(200).json({ success: true, data: sheetData });

  } catch (err) {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    console.error("Error en previsualización:", err);
    
    // Mensaje detallado
    res.status(400).json({ 
      success: false, 
     message: err.message,
    details: `Columnas requeridas: ${expectedColumns.join(", ")}`
    });
  }
}
// Función para previsualizar los datos del archivo subido
async function uploadFile(req, res) {
  try {
    if (!req.body.data || !Array.isArray(req.body.data)) {
      return res.status(400).json({ success: false, message: "No se proporcionaron datos para procesar." });
    }

    const sheetData = req.body.data.map(row => ({
      ...row,
      nro_serie: row.Nro_Serie ? String(row.Nro_Serie).trim() : "SIN_SERIE",
      Idcliente: row.IdCliente ? String(row.IdCliente) : null,
      Idmarca: row.Marca_nueva ? String(row.Marca_nueva) : null,
      Idmodelo: row.Modelo_nuevo ? String(row.Modelo_nuevo) : null,
      Idservicio: row.IdServicio ? Number(row.IdServicio) : null,
      idProducto: row.IdProducto ? String(row.IdProducto).trim() : null,
    }));

    console.log("Datos recibidos para procesamiento:", sheetData);
    // await deletePreviousData(sheetData);

    const pool = await poolPromise;
    const errores = [];
    const resultados = [];

    for (const [index, row] of sheetData.entries()) {
      const log = (msg) => console.log(`[Fila ${index + 1}] ${msg}`);
      const transaction = pool.transaction();
      transaction.lockTimeout = 5000; // Timeout de 5 segundos

      try {
        await transaction.begin();
        log(`📦 Procesando (${index + 1}/${sheetData.length})`);
        log(`🔍 Nro Serie: ${row.nro_serie}`);

        // Validación de Cliente
        let existe_cliente = 0
        if (!row.Idcliente) {
          log(`⚠️ Cliente no informado - Continuando sin validación`);
        } else {
          log(`⚙️ Validando cliente: ${row.Idcliente}`);
          const clienteExiste = await transaction.request()
            .input("IdCliente", sql.VarChar(50), row.Idcliente)
            .query("SELECT COUNT(*) AS count FROM Clientes WHERE nrocta = @IdCliente");

          if (clienteExiste.recordset[0].count === 0) {
            throw new Error(`Cliente no existe en la BD: ${row.Idcliente}`);
          }
          existe_cliente = 1
          log(`✅ Cliente encontrado`);
        }

        // Validación de Producto
        if (!row.idProducto) throw new Error('idProducto es requerido');
        log(`⚙️ Validando producto: ${row.idProducto}`);
        const productoExiste = await transaction.request()
          .input("idProducto", sql.VarChar(50), row.idProducto)
          .query("SELECT COUNT(*) AS count FROM Productos WHERE idProducto = @idProducto");

        if (productoExiste.recordset[0].count === 0) throw new Error(`Producto no encontrado: ${row.idProducto}`);

        // Validación Relación Producto-Servicio
        let existeRelacion = false;
        if (row.Idservicio) {
          const relacion = await transaction.request()
            .input("IDS", sql.Int, row.Idservicio)
            .input("IDP", sql.VarChar(50), row.idProducto)
            .query("SELECT COUNT(*) AS count FROM ServiciosProductos WHERE IdServicio = @IDS AND idProducto = @IDP");

          existeRelacion = relacion.recordset[0].count > 0;
        }

        // Obtener Marca
        const idMarcaDesc = row.Idmarca?.trim() || "SIN_MARCA";
        log(`🔍 Buscando marca: ${idMarcaDesc}`);
        const marcaId = await obtenerMarca(transaction, idMarcaDesc, index + 1);

        // Obtener Modelo
        const idModeloDesc = row.Idmodelo?.trim() || "SIN_MODELO";
        log(`🔍 Buscando modelo: ${idModeloDesc}`);
        const modeloId = await obtenerModelo(transaction, marcaId, idModeloDesc, index + 1);

        // Ubicación
        const ubicacionCliente = await transaction.request()
          .query("SELECT TOP 1 IdUbicacion FROM EquiposFCUbicaciones WHERE Descripcion LIKE '%en%cliente%'");
        const ubicacionDeposito = await transaction.request()
          .query("SELECT TOP 1 IdUbicacion FROM EquiposFCUbicaciones WHERE Descripcion LIKE '%deposito%'");
        const idubicacion = ubicacionCliente.recordset[0]?.IdUbicacion || ubicacionDeposito.recordset[0]?.IdUbicacion || 999;

        // Estado
        const estadoOperativo = await transaction.request()
          .query("SELECT TOP 1 IdEstado FROM EquiposFCEstados WHERE Descripcion LIKE '%operativo%'");
        if (!estadoOperativo.recordset[0]?.IdEstado) throw new Error("No se encontró estado operativo");

        // Insertar en EquiposFC
        const idequipo = await obtenerEquipo(transaction, index + 1, row.idProducto, marcaId, modeloId, row.nro_serie, idubicacion, estadoOperativo.recordset[0].IdEstado)

        if (existeRelacion && existe_cliente === 1) {
          log(`comenzando inserccion en ClientesServicios`);
          await insertarClientesServicio(transaction, index+1,row.Idcliente, row.Idservicio, row.fecha_desde, idequipo, idMarcaDesc, idModeloDesc, row.idProducto, row.nro_serie)
        }

        await transaction.commit();
        resultados.push({ fila: index + 1, mensaje: "Procesado correctamente" });
        log("✅ Transacción completada");

      } catch (error) {
        try {
          if (transaction._aborted === false) {
            await transaction.rollback();
          }
        } catch (rollbackError) {
          log(`⚠️ Error al hacer rollback: ${rollbackError.message}`);
        }
        log(`❌ Error: ${error.message}`);
        errores.push({ fila: index + 1, error: error.message });
      }
    }

    const generarReporte = (resultados, errores) => {
      const workbook = xlsx.utils.book_new();
      const wsResultados = xlsx.utils.json_to_sheet(resultados);
      const wsErrores = xlsx.utils.json_to_sheet(errores);

      xlsx.utils.book_append_sheet(workbook, wsResultados, 'Resultados');
      xlsx.utils.book_append_sheet(workbook, wsErrores, 'Errores');

      const fileName = `reporte_${Date.now()}.xlsx`;
      const filePath = path.join(__dirname, '../uploads', fileName);

      xlsx.writeFile(workbook, filePath);
      return filePath;
    };

    console.log("📄 Generando reporte...");
    const resultadosPath = generarReporte(resultados, errores);
    res.status(200).json({
      success: true,
      message: "Archivo procesado correctamente.",
      resultadosPath: `/uploads/${path.basename(resultadosPath)}`
    });

  } catch (error) {
    console.error('❌ Error en uploadFile:', error);
    res.status(500).json({ success: false, message: "Error al procesar el archivo." });
  }
}

// Funciones auxiliares actualizadas
async function obtenerMarca(transaction, descripcion, fila) {
  const log = (msg) => console.log(`[Fila ${fila}] ${msg}`);

  if (!descripcion?.trim()) throw new Error("Descripción de marca inválida");

  log(`Buscando marca: '${descripcion}'`);
  const result = await transaction.request()
    .input("Descripcion", sql.VarChar(50), descripcion)
    .query("SELECT TOP 1 IdMarca FROM EquiposFCMarcas WHERE Descripcion = @Descripcion");

  if (result.recordset.length > 0) {
    log(`Marca existente: ${result.recordset[0].IdMarca}`);
    return String(result.recordset[0].IdMarca);
  }

  const insertResult = await transaction.request()
    .input("Descripcion", sql.VarChar(50), descripcion)
    .query(`
      INSERT INTO EquiposFCMarcas (Descripcion)
      OUTPUT INSERTED.IdMarca
      VALUES (@Descripcion)
    `);

  log(`Nueva marca creada: ${insertResult.recordset[0].IdMarca}`);
  return String(insertResult.recordset[0].IdMarca);
}

async function insertarClientesServicio(transaction, fila, idcliente, idservicio, fecha_desde, idequipo, marca, modelo, idproducto, nro_serie) {
  const log = (msg) => console.log(`[Fila ${fila}] ${msg}`);

  // CHEQUEAR EXISTENCIA SERVICIO
  log(`Chequeando existencia servicio en cliente: '${nro_serie}' ${idcliente} ${idservicio}`);
  const result = await transaction.request()
    .input("idcliente", sql.VarChar(50), idcliente)
    .input("idservicio", sql.Int, idservicio)
    .input("nro_serie", sql.VarChar(50), idcliente)
    .query(`SELECT count(*) FROM ClientesServicios 
      WHERE IdCliente = @idcliente AND IdServicio = @idservicio and nro_serie = @nro_serie and fecha_baja is null`);

  if (result.recordset.length > 0) {
    // MODIFICAR CLIENTESERVICIO
    log(`modificando servicio en cliente: '${nro_serie}' ${idcliente} ${idservicio}`);
    const maxNrItemResult = await transaction.request()
      .input("idcliente", sql.VarChar(50), idcliente)
      .input("idservicio", sql.Int, idservicio)
      .input("nro_serie", sql.VarChar(50), idcliente)
      .query(`
                SELECT ISNULL(MAX(NrItem), 0) AS MaxItem 
                FROM ClientesServicios WITH (UPDLOCK) 
                WHERE IdCliente = @IdCliente AND IdServicio = @IdServicio and nro_serie = @nro_serie and fecha_baja is null
              `);
  
    const newNrItem = maxNrItemResult.recordset[0].MaxItem;

    await transaction.request()
      .input("idcliente", sql.VarChar(50), idcliente)
      .input("idservicio", sql.Int, idservicio)
      .input("nro_serie", sql.VarChar(50), idcliente)
      .input("nritem", sql.Int, newNrItem)
      .input("idequipo", sql.Int, idequipo)
      .input("marca", sql.VarChar(50), marca)
      .input("modelo", sql.VarChar(50), modelo)
      .query(`
              update clientesservicios set idequipo = @idequipo, marca = @marca, modelo = @modelo
              WHERE IdCliente = @IdCliente AND IdServicio = @IdServicio and nro_serie = @nro_serie and nritem = @nritem and fecha_baja is null
              `);
    
  } else {
    // INSERTAR CLIENTESERVICIO
    log(`Insertaando servicio en cliente: '${nro_serie}' ${idcliente} ${idservicio}`);
    const maxNrItemResult = await transaction.request()
      .input("IdCliente", sql.VarChar(50), row.Idcliente)
      .input("IdServicio", sql.Int, row.Idservicio)
      .query(`
                SELECT ISNULL(MAX(NrItem), 0) AS MaxItem 
                FROM ClientesServicios WITH (UPDLOCK) 
                WHERE IdCliente = @IdCliente AND IdServicio = @IdServicio and fecha_baja is null
              `);
  
    const newNrItem = maxNrItemResult.recordset[0].MaxItem + 1;
  
    await transaction.request()
      .input("idcliente", sql.VarChar(50), idcliente)
      .input("idservicio", sql.Int, idservicio)
      .input("fecha_desde", sql.DateTime, fecha_desde)
      .input("nritem", sql.Int, newNrItem)
      .input("idequipo", sql.Int, idequipo)
      .input("marca", sql.VarChar(50), marca)
      .input("modelo", sql.VarChar(50), modelo)
      .input("idproducto", sql.VarChar(50), idproducto)
      .input("nro_serie", sql.VarChar(50), nro_serie)
      .input("contrato", sql.VarChar(255), idcliente + '-' + String(newNrItem))
      .query(`
                insert into clientesservicios (idcliente,idservicio,nritem,idequipo,marca,modelo,
                    Nro_Serie,Porcentaje_Descuento,contrato, nroordenalta,nroordenbaja,
                    fecha_desde,Fecha_Hasta,fecha_alta,IdProducto, sector)
                values (@idcliente, @idservicio, @nritem, @idequipo, @marca, @modelo,
                    @nro_serie,0,@contrato,null,null,
                    @fecha_desde,'21000101',getdate(),@idproducto,'')
              `);
  }

}

async function obtenerEquipo(transaction, fila, idProducto, IdMarca, IdModelo, Nro_Serie, IdUbicacion, IdEstado) {
  const log = (msg) => console.log(`[Fila ${fila}] ${msg}`);

  // if (!descripcion?.trim()) throw new Error("Descripción de marca inválida");

  log(`Insertando EquipoFC ${idProducto} ${IdMarca} ${IdModelo} ${Nro_Serie} ${IdUbicacion} ${IdEstado}`);
  const result = await transaction.request()
    .input("nro_serie", sql.VarChar(50), Nro_Serie)
    .query("SELECT TOP 1 idequipo FROM equiposfc WHERE nro_serie = @nro_serie");

  if (result.recordset.length > 0) {
    log(`Equipo existente: ${result.recordset[0].idequipo}`);
    return String(result.recordset[0].idequipo);
  }

  log("✅ Insertando equipo en EquiposFC");
  const insertResult = await transaction.request()
    .input("idProducto", sql.VarChar(50), idProducto)
    .input("IdMarca", sql.VarChar(50), IdMarca)
    .input("IdModelo", sql.VarChar(50), IdModelo)
    .input("Nro_Serie", sql.VarChar(50), Nro_Serie)
    .input("IdUbicacion", sql.Int, IdUbicacion)
    .input("IdEstado", sql.Int, IdEstado)
    .query(`
      INSERT INTO EquiposFC 
      (idProducto, IdMarca, IdModelo, Nro_Serie, IdUbicacion, IdEstado, Fecha_Alta)
       OUTPUT inserted.idequipo
      VALUES 
      (@idProducto, @IdMarca, @IdModelo, @Nro_Serie, @IdUbicacion, @IdEstado, GETDATE())
    `);

  log(`Nueva equipofc creado: ${insertResult.recordset[0].idequipo}`);
  return String(insertResult.recordset[0].idequipo);
}

async function obtenerModelo(transaction, idMarca, descripcion, fila) {
  const log = (msg) => console.log(`[Fila ${fila}] ${msg}`);

  if (!descripcion?.trim()) throw new Error("Descripción de modelo inválida");

  log(`Buscando modelo: '${descripcion}' para marca ${idMarca}`);
  const result = await transaction.request()
    .input("Descripcion", sql.VarChar(50), descripcion)
    .input("IdMarca", sql.VarChar(50), idMarca)
    .query("SELECT TOP 1 IdModelo FROM EquiposFCMarcasModelos WHERE Descripcion = @Descripcion AND IdMarca = @IdMarca");

  if (result.recordset.length > 0) {
    log(`Modelo existente: ${result.recordset[0].IdModelo}`);
    return String(result.recordset[0].IdModelo);
  }

  const insertResult = await transaction.request()
    .input("IdMarca", sql.VarChar(50), idMarca)
    .input("Descripcion", sql.VarChar(50), descripcion)
    .query(`
      INSERT INTO EquiposFCMarcasModelos (IdMarca, Descripcion)
      OUTPUT INSERTED.IdModelo
      VALUES (@IdMarca, @Descripcion)
    `);

  log(`Nuevo modelo creado: ${insertResult.recordset[0].IdModelo}`);
  return String(insertResult.recordset[0].IdModelo);
}

module.exports = { uploadFile };


async function downloadData(req, res) {
  try {
    const pool = await poolPromise;

    // 1. Verificar duplicados
    console.log('VERIFICACION DE DUPLICADOS');
    const queryDuplicados = `
        SELECT nro_serie = LTRIM(RTRIM(nro_serie)), idcliente
        FROM ClientesServicios
        WHERE nro_serie IN (
            SELECT nro_serie
            FROM ClientesServicios
            WHERE fecha_baja IS NULL
            GROUP BY nro_serie
            HAVING COUNT(idcliente) > 1
        )
        AND fecha_baja IS NULL
        ORDER BY nro_serie, idcliente;
    `;
    const resultDuplicados = await pool.request().query(queryDuplicados);
    console.log('GET DUPLICADOS');

    if (resultDuplicados.recordset.length > 0) {
      console.log("Duplicados detectados:", resultDuplicados.recordset);

      const workbookDuplicados = xlsx.utils.book_new();
      const worksheetDuplicados = xlsx.utils.json_to_sheet(resultDuplicados.recordset);
      xlsx.utils.book_append_sheet(workbookDuplicados, worksheetDuplicados, 'Duplicados');

      const filePathDuplicados = path.join(__dirname, '../uploads', 'duplicados.xlsx');
      xlsx.writeFile(workbookDuplicados, filePathDuplicados);

      res.download(filePathDuplicados, 'duplicados.xlsx', (err) => {
        if (err) {
          console.error('Error al enviar el archivo:', err);
          return res.status(500).send('Error al descargar el archivo.');
        }
        if (fs.existsSync(filePathDuplicados)) fs.unlinkSync(filePathDuplicados);
      });
      return;
    }

    // 2. Proceso de estructura
    console.log('NO HAY DUPLICADOS - DESCARGA ESTRUCTURA');
    const queryEstructura = `
        SELECT IdCliente, Marca, '' AS Marca_nueva, Modelo, '' AS Modelo_nuevo,
               Nro_Serie, idProducto,
               ISNULL((SELECT TOP 1 Descripcion FROM EquiposFCUbicaciones WHERE Descripcion LIKE '%CLIENTE%'), '') AS idubicacion,
               ISNULL((SELECT TOP 1 Descripcion FROM EquiposFCEstados WHERE Descripcion LIKE '%OPERATIV%'), '') AS idestado,
               IdServicio, Fecha_Desde
        FROM ClientesServicios
        WHERE Fecha_Baja IS NULL
          AND NOT Nro_Serie IN (SELECT Nro_Serie FROM EquiposFC);
    `;

    console.log(queryEstructura);
    const resultEstructura = await pool.request().query(queryEstructura);
    console.log('DESCARGAR ESTRUCTURA BD');

    // Validación de datos vacíos
    if (resultEstructura.recordset.length === 0) {
      console.log('No hay datos para generar estructura');
      return res.status(404).json({
        success: false,
        message: 'No se encontraron datos para descargar.'
      });
    }

    // Creación de directorio
    const uploadsDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadsDir)) {
      console.log('Creando directorio uploads');
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Creación y envío de Excel
    try {
      console.log(`Registros encontrados: ${resultEstructura.recordset.length}`);

      const workbookEstructura = xlsx.utils.book_new();
      const worksheetEstructura = xlsx.utils.json_to_sheet(resultEstructura.recordset);
      xlsx.utils.book_append_sheet(workbookEstructura, worksheetEstructura, 'Estructura');

      // Generar nombre único
      const timestamp = Date.now();
      const fileName = `estructura_datos_${timestamp}.xlsx`;
      const filePathEstructura = path.join(uploadsDir, fileName);

      xlsx.writeFile(workbookEstructura, filePathEstructura);
      await new Promise(resolve => setTimeout(resolve, 500));
      console.log('Archivo Excel creado en:', filePathEstructura);

      res.download(filePathEstructura, fileName, (err) => {
        if (err) {
          console.error('Error al enviar el archivo:', err);
          if (fs.existsSync(filePathEstructura)) fs.unlinkSync(filePathEstructura);
          return res.status(500).json({
            success: false,
            message: 'Error al descargar el archivo.'
          });
        }

        // Nuevo mensaje de éxito
        console.log('Archivo descargado correctamente:', fileName);

        setTimeout(() => {
          if (fs.existsSync(filePathEstructura)) {
            fs.unlinkSync(filePathEstructura);
            console.log('Archivo temporal eliminado:', fileName);
          }
        }, 30 * 60 * 1000);
      });

    } catch (err) {
      console.error('Error en proceso de estructura:', err.message);
      return res.status(500).json({
        success: false,
        message: 'Error al generar estructura',
        error: err.message
      });
    }

  } catch (err) {
    console.error('Error general en downloadData:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: err.message
    });
  }
}

module.exports = { uploadFile, previewFile, downloadData };