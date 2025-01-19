const fs = require("fs");
const path = require("path");
const xlsx = require("xlsx");
const { poolPromise } = require("../models/database"); // Conexión a la base de datos


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
        // Verificamos si se subió un archivo
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No se subió ningún archivo." });
        }

        // Ruta del archivo subido
        const filePath = path.join(__dirname, "../uploads", req.file.filename);

        // Leer el archivo Excel
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0]; // Tomamos el primer sheet del archivo
        const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]); // Convertimos a JSON

        console.log("Datos procesados del archivo:", sheetData); // Verifica los datos

        // Conectamos a la base de datos e insertamos los datos
        const pool = await poolPromise;
        const query = `
            INSERT INTO tabla_equipos_servicios (
                idproducto, Idmarca, Idmodelo, nro_serie, Idcliente, Idubicacion,
                Idestado, Idservicio, Sector, fecha_desde_servicio, Fecha_modificacion
            )
            VALUES (
                @idproducto, @Idmarca, @Idmodelo, @nro_serie, @Idcliente, @Idubicacion,
                @Idestado, @Idservicio, @Sector, @fecha_desde_servicio, @Fecha_modificacion
            )
        `;

        const transaction = pool.transaction();
        await transaction.begin(); // Iniciamos la transacción

        for (const row of sheetData) {
            const request = transaction.request();
            // Mapeamos las columnas del Excel con las columnas de la base de datos
            request.input("idproducto", row["idproducto"]);
            request.input("Idmarca", row["Idmarca"]);
            request.input("Idmodelo", row["Idmodelo"]);
            request.input("nro_serie", row["nro_serie"]);
            request.input("Idcliente", row["Idcliente"]);
            request.input("Idubicacion", row["Idubicacion"]);
            request.input("Idestado", row["Idestado"]);
            request.input("Idservicio", row["Idservicio"]);
            request.input("Sector", row["Sector"]);
            request.input("fecha_desde_servicio", row["fecha_desde del servicio"]);
            request.input("Fecha_modificacion", row["Fecha_modificacion"]);
            await request.query(query); // Ejecutamos la consulta
        }

        await transaction.commit(); // Confirmamos la transacción

        // Eliminamos el archivo temporal para evitar acumulación de datos
        fs.unlinkSync(filePath);

        // Respondemos al cliente
        res.status(200).json({ success: true, message: "Archivo procesado y datos insertados correctamente." });
    } catch (err) {
        console.error("Error al procesar el archivo:", err);
        res.status(500).json({ success: false, message: "Error al procesar el archivo.", error: err.message });
    }
}


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
          // Caso: Existen duplicados
          console.log("Duplicados detectados:", resultDuplicados.recordset);

          // Crear archivo Excel con duplicados
          const workbookDuplicados = xlsx.utils.book_new();
          const worksheetDuplicados = xlsx.utils.json_to_sheet(resultDuplicados.recordset);
          xlsx.utils.book_append_sheet(workbookDuplicados, worksheetDuplicados, 'Duplicados');
          
          const filePathDuplicados = path.join(__dirname, '../uploads', 'duplicados.xlsx');
          xlsx.writeFile(workbookDuplicados, filePathDuplicados);

          // Descargar archivo y mostrar mensaje
          res.download(filePathDuplicados, 'duplicados.xlsx', (err) => {
              if (err) {
                  console.error('Error al enviar el archivo:', err);
                  return res.status(500).send('Error al descargar el archivo.');
              }
              fs.unlinkSync(filePathDuplicados); // Borrar archivo después de enviarlo
              
              // Mostrar mensaje al usuario
              res.status(200).json({
                  success: true,
                  message: "Existen duplicados. Se ha generado un archivo con los detalles."
              });
          });

          return; // Salimos de la función después de manejar duplicados
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

      // Descargar archivo al cliente
      res.download(filePathEstructura, 'estructura_datos.xlsx', (err) => {
          if (err) {
              console.error('Error al enviar el archivo:', err);
              return res.status(500).send('Error al descargar el archivo.');
          }
          fs.unlinkSync(filePathEstructura); // Borrar archivo después de enviarlo
      });
  } catch (err) {
      console.error('Error al descargar los datos:', err);
      res.status(500).json({ success: false, message: 'Error al descargar los datos.', error: err.message });
  }
}



module.exports = { uploadFile, previewFile, downloadData }; // Exportamos la nueva función






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



