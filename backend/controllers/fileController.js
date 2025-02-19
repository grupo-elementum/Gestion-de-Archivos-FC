const sql = require("mssql");
const fs = require("fs");
const path = require("path");
const xlsx = require("xlsx");
const { poolPromise } = require("../models/database"); // Conexión a la base de datos
const deletePreviousData = require("./deletePreviousData"); // Función interna para el borrado de datos
const { error } = require("console");


// Función para previsualizar los datos del archivo subido
async function previewFile(req, res) {
  try {
    // Verificamos si se subió un archivo
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No se subió ningún archivo para previsualización." });
    }

    console.log('Archivo recibido para previsualización:', req.file);

    // Ruta del archivo subido
    const filePath = path.join(__dirname, "../uploads", req.file.filename);

    // Leer el archivo Excel
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0]; // Tomamos el primer sheet del archivo
    const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]); // Convertimos a JSON

    // Eliminamos el archivo temporal después de leerlo
    fs.unlinkSync(filePath);

    // Enviamos los datos en formato JSON al frontend
    res.status(200).json({ success: true, data: sheetData });
  } catch (err) {
    console.error("Error al previsualizar el archivo:", err);
    res.status(500).json({ success: false, message: "Error al previsualizar el archivo.", error: err.message });
  }
}

async function uploadFile(req, res) {
  try {
    // Verificar si se subió un archivo válido
    if (!req.body.data || !Array.isArray(req.body.data)) {
      return res.status(400).json({ success: false, message: "No se proporcionaron datos para procesar." });
    }

    // Transformar los datos del archivo
    const sheetData = req.body.data.map(row => ({
      ...row,
      nro_serie: row.Nro_Serie ? String(row.Nro_Serie).trim() : "SIN_SERIE",
      Idcliente: row.IdCliente ? String(row.IdCliente) : null,
      Idmarca: row.Marca_nueva ? String(row.Marca_nueva) : null,
      Idmodelo: row.Modelo_nuevo ? String(row.Modelo_nuevo) : null,
      Idservicio: row.IdServicio ? Number(row.IdServicio) : null, // Convertir a número
      idProducto: row.IdProducto ? String(row.IdProducto).trim() : null, // 

    }));

    console.log("Datos recibidos para procesamiento:", sheetData);

    // 1. **Borrar datos previos relacionados con las filas del archivo**
    await deletePreviousData(sheetData); // Asegurar que esta función siga siendo utilizada

    // 2. Procesar cada fila del archivo
    const pool = await poolPromise;
    const errores = [];
    const resultados = [];

    for (const [index, row] of sheetData.entries()) {
      const transaction = pool.transaction();
      await transaction.begin();

      try { 
        console.log(`\n📦 Procesando fila ${index + 1}/${sheetData.length}`);
        console.log('🔍 Nro Serie:', row.nro_serie);

        // 3. **Validación de Cliente**
        if (!row.Idcliente) {
          console.log(`⚠️ Fila ${index}: Cliente no informado - Continuando sin validación`);
        } else {
          console.log('⚙️ Validando cliente:', row.Idcliente);
          const clienteExiste = await transaction.request()
            .input("IdCliente", sql.VarChar(50), row.Idcliente)
            .query("SELECT COUNT(*) AS count FROM Clientes WHERE nrocta = @IdCliente");

          if (clienteExiste.recordset[0].count === 0) {
            throw new Error(`Cliente no existe en la BD: ${row.Idcliente}`);
          }
          console.log(`✅ Cliente ${row.Idcliente} encontrado.`);
        }

        // 4. **Validación de Producto**
        
        // console.log(row)
        // console.log('producto: ', row.idProducto)
        if (!row.idProducto) throw new Error('idProducto es requerido');
        console.log('⚙️ Validando producto:', row.idProducto);
        const productoExiste = await transaction.request()

          .input("idProducto", sql.VarChar(50), row.idProducto)
          .query("SELECT COUNT(*) AS count FROM Productos WHERE idProducto = @idProducto");

        if (productoExiste.recordset[0].count === 0) throw new Error(`Producto no encontrado: ${row.idProducto}`);

        // 5. **Validación de Relación Producto-Servicio**
        const relacion = await transaction.request()
          .input("IDS", sql.Int, row.Idservicio)
          .input("IDP", sql.VarChar(50), row.idProducto) 
          .query("SELECT COUNT(*) AS count FROM ServiciosProductos WHERE IdServicio = @IDS AND idProducto = @IDP");

        const existeRelacion = relacion.recordset[0].count > 0;

        if (existeRelacion) {
          console.log(`✅ Producto ${row.idProducto} vinculado al servicio ${row.Idservicio}, insertando en ClientesServicios.`);
          await transaction.request()
            .input("IdCliente", sql.Int, row.Idcliente)
            .input("idProducto", sql.VarChar (50), row.idProducto)/// ver si puede ser aca el error 
            .input("IdServicio", sql.Int, row.Idservicio)
            .query("INSERT INTO ClientesServicios (IdCliente, idProducto, IdServicio) VALUES (@IdCliente, @idProducto, @IdServicio)");
        } else {
          console.warn(`⚠️Producto ${row.idProducto} no vinculado a un servicio. No se insertará en ClientesServicios, pero sí en EquiposFC.`);
        }

        // 6. **Obtener marca y modelo antes de la inserción**
        const idMarcaDesc = row.Idmarca && typeof row.Idmarca === "string" ? row.Idmarca.trim() : "SIN_MARCA";
        console.log(`🔍 Buscando marca: ${idMarcaDesc}`);
        const marcaId = await obtenerMarca(pool, transaction, idMarcaDesc);

        const idModeloDesc = row.Idmodelo && typeof row.Idmodelo === "string" ? row.Idmodelo.trim() : "SIN_MODELO";
        console.log(`🔍 Buscando modelo: ${idModeloDesc}`);
        const modeloId = await obtenerModelo(pool, transaction, marcaId, idModeloDesc);        

        // 7. **Ubicación**
        const ubicacionCliente = await transaction.request()
          .query("SELECT TOP 1 IdUbicacion FROM EquiposFCUbicaciones WHERE Descripcion LIKE '%en%cliente%'");
        const ubicacionDeposito = await transaction.request()
          .query("SELECT TOP 1 IdUbicacion FROM EquiposFCUbicaciones WHERE Descripcion LIKE '%deposito%'");

        const idubicacion = ubicacionCliente.recordset[0]?.IdUbicacion || ubicacionDeposito.recordset[0]?.IdUbicacion || 999;

        // 8. **Estado**
        const estadoOperativo = await transaction.request()
          .query("SELECT TOP 1 IdEstado FROM EquiposFCEstados WHERE Descripcion LIKE '%operativo%'");

        const idestado = estadoOperativo.recordset[0]?.IdEstado;
        if (!idestado) throw new Error("No se encontró un estado operativo válido.");

        // 9. **Inserción en EquiposFC**
        console.log("✅ Insertando equipo en EquiposFC...");
        await transaction.request()
          .input("idProducto", sql.VarChar(50), row.idProducto)
          .input("IdMarca", sql.VarChar(50), String(marcaId))
          .input("IdModelo", sql.VarChar(50), String(modeloId))
          .input("Nro_Serie", sql.VarChar(50), row.nro_serie)
          .input("IdUbicacion", sql.Int, idubicacion)
          .input("IdEstado", sql.Int, idestado)
          .query(`
            INSERT INTO EquiposFC 
            (idProducto, IdMarca, IdModelo, Nro_Serie, IdUbicacion, IdEstado, Fecha_Alta)
            VALUES 
            (@idProducto, @IdMarca, @IdModelo, @Nro_Serie, @IdUbicacion, @IdEstado, GETDATE())
          `);

        // 10. **Finalizar transacción**
        console.log("✅ Transacción completada.");
        resultados.push({ fila: index + 1, mensaje: "Procesado correctamente" });
        await transaction.commit();

      } catch (error) { 
        await transaction.rollback();
        console.error(`❌ Error en fila ${index + 1}: ${error.message}`);
        errores.push({ fila: index + 1, error: error.message });
      }
    }
    
    // **Generar reporte**
    const generarReporte = (resultados, errores) => {
      const workbook = xlsx.utils.book_new();
      
      // Hoja de resultados
      const wsResultados = xlsx.utils.json_to_sheet(resultados);
      xlsx.utils.book_append_sheet(workbook, wsResultados, 'Resultados');
      
      // Hoja de errores
      const wsErrores = xlsx.utils.json_to_sheet(errores);
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

// Función auxiliar para obtener marcas
async function obtenerMarca(pool, transaction, descripcion) {
  if (!descripcion || typeof descripcion !== "string" || descripcion.trim() === "") {
    throw new Error("La descripción de la marca es inválida.");
  }

  console.log(`Buscando marca con descripción: '${descripcion}'`);

  const result = await transaction.request()
    .input("Descripcion", sql.VarChar(50), descripcion)
    .query("SELECT TOP 1 IdMarca FROM EquiposFCMarcas WHERE Descripcion = @Descripcion");

  if (result.recordset.length > 0) {
    console.log(`Marca encontrada: ${result.recordset[0].IdMarca}`);
    return String(result.recordset[0].IdMarca);
  }

  // Insertar nueva marca si no existe
  const insertResult = await transaction.request()
    .input("Descripcion", sql.VarChar(50), descripcion)
    .query(`
      INSERT INTO EquiposFCMarcas (Descripcion)
      OUTPUT INSERTED.IdMarca
      VALUES (@Descripcion)
    `);

  if (!insertResult.recordset.length) {
    throw new Error(`Error al insertar la marca '${descripcion}'`);
  }

  console.log(`Nueva marca creada con ID: ${insertResult.recordset[0].IdMarca}`);
  return String(insertResult.recordset[0].IdMarca);
}

// Función auxiliar para obtener modelos
async function obtenerModelo(pool, transaction, idMarca, descripcionModelo) {
  if (!descripcionModelo || typeof descripcionModelo !== "string" || descripcionModelo.trim() === "") {
    throw new Error("La descripción del modelo es inválida.");
  }

  console.log(`Buscando modelo con descripción: '${descripcionModelo}', para la marca: '${idMarca}'`);

  const result = await transaction.request()
    .input("Descripcion", sql.VarChar(50), descripcionModelo)
    .input("IdMarca", sql.VarChar(50), idMarca)
    .query("SELECT TOP 1 IdModelo FROM EquiposFCMarcasModelos WHERE Descripcion = @Descripcion AND IdMarca = @IdMarca");

  if (result.recordset.length > 0) {
    console.log(`Modelo encontrado: ${result.recordset[0].IdModelo}`);
    return String(result.recordset[0].IdModelo);
  }

  // Insertar nuevo modelo si no existe
  const insertResult = await transaction.request()
    .input("IdMarca", sql.VarChar(50), idMarca)
    .input("Descripcion", sql.VarChar(50), descripcionModelo)
    .query(`
      INSERT INTO EquiposFCMarcasModelos (IdMarca, Descripcion)
      OUTPUT INSERTED.IdModelo
      VALUES (@IdMarca, @Descripcion)
    `);

  if (!insertResult.recordset.length) {
    throw new Error(`Error al insertar el modelo '${descripcionModelo}' para la marca '${idMarca}'`);
  }

  console.log(`Nuevo modelo creado con ID: ${insertResult.recordset[0].IdModelo}`);
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