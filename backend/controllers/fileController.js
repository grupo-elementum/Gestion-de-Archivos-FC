const sql = require("mssql");
const fs = require("fs");
const path = require("path");
const xlsx = require("xlsx");
const { poolPromise } = require("../models/database"); // Conexión a la base de datos
const deletePreviousData = require("./deletePreviousData"); // Función interna para el borrado de datos


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
      nro_serie: row.nro_serie ? String(row.nro_serie).trim() : "SIN_SERIE",
      Idcliente: row.Idcliente ? String(row.Idcliente) : null,
      Idmarca: row.Idmarca ? String(row.Idmarca) : null,
      Idmodelo: row.Idmodelo ? String(row.Idmodelo) : null,
      Idservicio: row.Idservicio ? Number(row.Idservicio) : null, // Convertir a número
    }));

    console.log("Datos recibidos para procesamiento:", sheetData);

    // 1. **Borrar datos previos relacionados con las filas del archivo**
    await deletePreviousData(sheetData); // Asegurar que esta función siga siendo utilizada

    // 2. Procesar cada fila del archivo
    const pool = await poolPromise;
    const transaction = pool.transaction();
    await transaction.begin();

    const errores = [];
    const resultados = [];
    var linea_sin_cliente = false
    for (const row of sheetData) {
      console.log('datos a procesar: ', row)
      try {
        linea_sin_cliente = false
        linea_sin_servicios = false
        // **1. Existencia de Cliente**
        if (!row.Idcliente) {
          console.log('el cliente no esta informado - activo bandera')
          linea_sin_cliente = true//levanta  bandera
          // throw new Error(`Falta Idcliente en la fila.`);
        }

        if (!linea_sin_cliente){
          console.log('chequeo existencia cliente - bandera false')
          const clienteExiste = await pool.request()
          .input("IdCliente", sql.VarChar(50), row.Idcliente)
          .query("SELECT COUNT(*) AS count FROM Clientes WHERE nrocta = @IdCliente");

          if (clienteExiste.recordset[0].count === 0) {
            throw new Error(`Cliente no encontrado en la BD: ${row.Idcliente}`);
          }
        }
        

        // **2. Existencia de Producto**
        console.log('chequeo producto informado en excel')
        if (!row.idproducto) {
          throw new Error(`Falta IdProducto en la fila.`);
        }
        console.log('chequeo existencia del producto')
        const productoExiste = await transaction.request()
          .input("IdProducto", sql.Int, row.idproducto)
          .query("SELECT COUNT(*) AS count FROM Productos WHERE idproducto = @IdProducto");

        if (productoExiste.recordset[0].count === 0) {
          throw new Error(`Producto no encontrado en la BD: ${row.idproducto}`);
        }

        // **3. Existencia de Servicio**
        if (!row.Idservicio) {
          console.log('servicio no informado en excel - activo bandera')
          linea_sin_servicios = true
          // throw new Error(`El Idservicio es inválido o no está definido.`);
        }
        if (!linea_sin_servicios){
          console.log('chequeo existencia de servicio - bandera false')
          const servicioExiste = await transaction.request()
            .input("IdServicio", sql.Int, row.Idservicio)
            .query("SELECT COUNT(*) AS count FROM ServiciosEnc WHERE idservicio = @IdServicio");

          if (servicioExiste.recordset[0].count === 0) {
            throw new Error(`Servicio no encontrado en la BD: ${row.Idservicio}`);
          }

          // **4. Relación Producto-Servicio**
          const productoServicioAsociado = await transaction.request()
            .input("IDS", sql.Int, row.Idservicio)
            .input("IDP", sql.Int, row.idproducto)
            .query("SELECT COUNT(*) AS count FROM ServiciosProductos WHERE IdServicio = @IDS AND idproducto = @IDP");

          if (productoServicioAsociado.recordset[0].count === 0) {
            throw new Error(`El producto ${row.idproducto} no está asociado al servicio ${row.Idservicio}.`);
          }
        }
        // **5. Obtener marca y modelo**
        const idMarcaDesc = row.Idmarca && typeof row.Idmarca === "string" ? row.Idmarca.trim() : "SIN_MARCA";
        console.log(`Buscando marca: ${idMarcaDesc}`);
        const marcaId = await obtenerMarca(pool, transaction, idMarcaDesc);

        const modeloId = await obtenerModelo(pool, transaction, marcaId, row.Idmodelo);

        // **6. Ubicaciones**
        const ubicacionCliente = await transaction.request()
          .query("SELECT TOP 1 IdUbicacion FROM EquiposFCUbicaciones WHERE Descripcion LIKE '%en%cliente%'");

        const ubicacionDeposito = await transaction.request()
          .query("SELECT TOP 1 IdUbicacion FROM EquiposFCUbicaciones WHERE Descripcion LIKE '%deposito%'");

        const idubicacion = ubicacionCliente.recordset[0]?.IdUbicacion || ubicacionDeposito.recordset[0]?.IdUbicacion;

        if (!idubicacion) {
          throw new Error("No se encontró una ubicación válida (en cliente o depósito).");
        }

        // **7. Estado**
        const estadoOperativo = await transaction.request()
          .query("SELECT TOP 1 IdEstado FROM EquiposFCEstados WHERE Descripcion LIKE '%operativo%'");

        const idestado = estadoOperativo.recordset[0]?.IdEstado;

        if (!idestado) {
          throw new Error("No se encontró un estado operativo válido.");
        }

        // **Verificar si el Nro_Serie ya existe en EquiposFC**
        const nroSerieExiste = await transaction.request()
          .input("Nro_Serie", sql.VarChar(50), row.nro_serie)
          .query("SELECT COUNT(*) AS count FROM EquiposFC WHERE Nro_Serie = @Nro_Serie");

        if (nroSerieExiste.recordset[0].count > 0) {
          throw new Error(`El número de serie ${row.nro_serie} ya existe en EquiposFC.`);
        }

        // **Insertar datos procesados en EquiposFC**
        await transaction.request()
          .input("IdProducto", sql.Int, row.idproducto)
          .input("IdMarca", sql.VarChar(50), String(marcaId))
          .input("IdModelo", sql.VarChar(50), String(modeloId))
          .input("Nro_Serie", sql.VarChar(50), row.nro_serie ? String(row.nro_serie).trim() : "SIN_SERIE")
          .input("IdUbicacion", sql.Int, idubicacion)
          .input("IdEstado", sql.Int, idestado)
          .query(`
            INSERT INTO EquiposFC 
            (IdProducto, IdMarca, IdModelo, Nro_Serie, IdUbicacion, IdEstado, Fecha_Alta)
            VALUES 
            (@IdProducto, @IdMarca, @IdModelo, @Nro_Serie, @IdUbicacion, @IdEstado, GETDATE())
          `);

        // **Condición: Si existe un servicio asociado al cliente, modificarlo**
        // if (!linea_sin_cliente && !linea_sin_servicio)
        const servicioClienteExiste = await transaction.request()
          .input("IdCliente", sql.VarChar(50), row.Idcliente)
          .input("IdServicio", sql.Int, row.Idservicio)
          .query("SELECT COUNT(*) AS count FROM ClientesServicios WHERE IdCliente = @IdCliente AND IdServicio = @IdServicio and nro_serie = @nroserie and fecha_baja is null");

        if (servicioClienteExiste.recordset[0].count > 0) {
          console.log(`Modificando servicio existente para el cliente...`);
          await transaction.request()
            .input("IdEquipo", sql.Int, row.idproducto)
            .input("IdServicio", sql.Int, row.Idservicio)
            .query(`
              UPDATE ClientesServicios
              SET IdEquipo = @IdEquipo
              WHERE IdServicio = @IdServicio
            `);
          console.log(`Servicio actualizado correctamente.`);
        } else {
          // **Condición alternativa: Si no existe el servicio, insertarlo**
          console.log(`Insertando nuevo servicio en ClientesServicios...`);
          await transaction.request()
            .input("IdCliente", sql.VarChar(50), row.Idcliente)
            .input("IdServicio", sql.Int, row.Idservicio)
            .input("IdEquipo", sql.Int, row.idproducto)
            .query(`
              INSERT INTO ClientesServicios (IdCliente, IdServicio, IdEquipo, Fecha_Desde)
              VALUES (@IdCliente, @IdServicio, @IdEquipo, GETDATE())
            `);
          console.log(`Nuevo servicio agregado para el cliente.`);
        }

        resultados.push({ fila: row, mensaje: "Procesado correctamente" });
        await transaction.commit();

      } catch (error) {
        errores.push({ fila: row, mensaje: error.message });
        await transaction.rollback();
        console.error("Error al procesar fila:", error);
      }
    }

    // // Confirmar la transacción solo si no hubo errores
    // if (errores.length === 0) {
    //   await transaction.commit();
    // } else {
    //   await transaction.rollback();
    // }

    // 3. Generar archivo Excel con resultados
    const workbookResultados = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbookResultados, xlsx.utils.json_to_sheet(resultados), "Resultados");
    xlsx.utils.book_append_sheet(workbookResultados, xlsx.utils.json_to_sheet(errores), "Errores");

    const resultadosPath = path.join(__dirname, "../uploads", "resultados_importacion.xlsx");
    xlsx.writeFile(workbookResultados, resultadosPath);

    res.status(200).json({
      success: true,
      message: "Archivo procesado correctamente.",
      resultadosPath: `/uploads/resultados_importacion.xlsx`,
    });
  } catch (err) {
    console.error("Error al procesar el archivo:", err);
    res.status(500).json({ success: false, message: "Error al procesar el archivo.", error: err.message });
  }
}

// Función auxiliar para obtener o insertar marcas
async function obtenerMarca(pool, transaction, descripcion) {
  if (!descripcion || typeof descripcion !== "string" || descripcion.trim() === "") {
    throw new Error("La descripción de la marca es inválida.");
  }

  console.log(`Buscando IdMarca para la descripción: '${descripcion}'`);

  // **Buscar la marca en la tabla**
  const result = await transaction.request()
    .input("Descripcion", sql.VarChar(50), descripcion)
    .query("SELECT TOP 1 IdMarca FROM EquiposFCMarcas WHERE Descripcion = @Descripcion");

  if (result.recordset.length > 0) {
    console.log(`Marca encontrada: ${result.recordset[0].IdMarca}`);
    return String(result.recordset[0].IdMarca); // Retornamos como string
  }

  // **Si no se encuentra, insertamos una nueva marca**
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

  // **Si no existe, insertar el nuevo modelo**
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

    if (resultDuplicados.recordset.length > 0) {
      console.log("Duplicados detectados:", resultDuplicados.recordset);

      // Crear archivo Excel con duplicados
      const workbookDuplicados = xlsx.utils.book_new();
      const worksheetDuplicados = xlsx.utils.json_to_sheet(resultDuplicados.recordset);
      xlsx.utils.book_append_sheet(workbookDuplicados, worksheetDuplicados, 'Duplicados');

      const filePathDuplicados = path.join(__dirname, '../uploads', 'duplicados.xlsx');
      xlsx.writeFile(workbookDuplicados, filePathDuplicados);

      // Enviar archivo al cliente
      res.download(filePathDuplicados, 'duplicados.xlsx', (err) => {
        if (err) {
          console.error('Error al enviar el archivo:', err);
          return res.status(500).send('Error al descargar el archivo.');
        }
        fs.unlinkSync(filePathDuplicados); // Borrar archivo después de enviarlo
      });

      // Enviar respuesta al frontend con el tipo de archivo
      return res.status(200).json({
        success: true,
        fileType: "duplicados",
        message: "Archivo con duplicados generado correctamente."
      });
    }

    // 2. Si no hay duplicados, descargar estructura de información
    const queryEstructura = `
        SELECT IdCliente, Marca, '' AS Marca_nueva, Modelo, '' AS Modelo_nuevo,
               Nro_Serie, IdProducto,
               ISNULL((SELECT TOP 1 Descripcion FROM EquiposFCUbicaciones WHERE Descripcion LIKE '%CLIENTE%'), '') AS idubicacion,
               ISNULL((SELECT TOP 1 Descripcion FROM EquiposFCEstados WHERE Descripcion LIKE '%OPERATIV%'), '') AS idestado,
               IdServicio, Fecha_Desde
        FROM ClientesServicios
        WHERE Fecha_Baja IS NULL
          AND NOT Nro_Serie IN (SELECT Nro_Serie FROM EquiposFC);
      `;
    const resultEstructura = await pool.request().query(queryEstructura);

    if (resultEstructura.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'No se encontraron datos para descargar.' });
    }

    // Crear archivo Excel con estructura de información
    const workbookEstructura = xlsx.utils.book_new();
    const worksheetEstructura = xlsx.utils.json_to_sheet(resultEstructura.recordset);
    xlsx.utils.book_append_sheet(workbookEstructura, worksheetEstructura, 'Estructura');

    const filePathEstructura = path.join(__dirname, '../uploads', 'estructura_datos.xlsx');
    xlsx.writeFile(workbookEstructura, filePathEstructura);

    // Enviar archivo al cliente
    res.download(filePathEstructura, 'estructura_datos.xlsx', (err) => {
      if (err) {
        console.error('Error al enviar el archivo:', err);
        return res.status(500).send('Error al descargar el archivo.');
      }
      fs.unlinkSync(filePathEstructura); // Borrar archivo después de enviarlo
    });

    // Enviar respuesta al frontend con el tipo de archivo
    return res.status(200).json({
      success: true,
      fileType: "estructura",
      message: "Archivo con estructura completa generado correctamente."
    });
  } catch (err) {
    console.error('Error al descargar los datos:', err);
    res.status(500).json({ success: false, message: 'Error al descargar los datos.', error: err.message });
  }
}







module.exports = { uploadFile, previewFile, downloadData, }; // Exportamos la nueva función






//CODIGO COMPARTIDO POR LEAX///
//*import * as XLSX from "xlsx";
//const exportToExcel = (pdfExportData) => {
//const worksheet = XLSX.utils.json_to_sheet(pdfExportData);
//const workbook = XLSX.utils.book_new();

//const doctitle = "Informe de " + title;

// Agregar la hoja de trabajo al libro
//XLSX.utils.book_append_sheet(workbook, worksheet, doctitle);

// Generar el archivo Excel
//XLSX.writeFile(workbook, `${doctitle}.xlsx`);
//};



