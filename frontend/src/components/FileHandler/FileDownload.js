import React from 'react';
import axios from 'axios';

const FileDownload = ({ fileName = 'estructura_datos.xlsx', endpoint = 'http://localhost:4000/api/download-database' }) => {
  const handleDownload = async () => {
    try {
      const response = await axios.get(endpoint, { 
        responseType: 'blob',
        validateStatus: (status) => status === 200 || status === 500 // Permitir manejar 500 como errores
      });
      
      // 1. Obtener nombre real del archivo desde headers
      const contentDisposition = response.headers['content-disposition'];
      const downloadedFileName = contentDisposition 
        ? contentDisposition.split('filename=')[1].replace(/"/g, '') 
        : fileName;

      // 2. Crear enlace de descarga
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', downloadedFileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // 3. Mostrar mensaje específico según tipo de archivo
      if (downloadedFileName.includes('duplicados')) {
        alert('✅ Archivo de duplicados descargado correctamente');
      } else if (downloadedFileName.includes('estructura_datos')) {
        alert('✅ Estructura de datos descargada exitosamente');
      } else {
        alert('✅ Descarga completada');
      }

    } catch (error) {
      // 4. Manejo mejorado de errores
      let errorMessage = 'Error de conexión con el backend';
      
      if (error.response) {
        if (error.response.data instanceof Blob) {
          const errorText = await error.response.data.text();
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.message || 'Error en el servidor';
          } catch {
            errorMessage = 'El archivo solicitado no pudo generarse';
          }
        } else {
          errorMessage = error.response.data?.message || 'Error desconocido';
        }
      }
      
      alert(`❌ ${errorMessage}`);
    }
  };

  return (
    <button className="btn download-btn" onClick={handleDownload}>
      Descargar Archivo
    </button>
  );
};

export default FileDownload;