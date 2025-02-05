import React from 'react';
import axios from 'axios';

const FileDownload = ({ fileName = 'datos_FrioCalor.xlsx', endpoint = 'http://localhost:4000/api/download-database' }) => {
  const handleDownload = async () => {
    try {
      // Realizar la solicitud al backend
      const response = await axios.get(endpoint, { responseType: 'blob' });

      // Crear un enlace para descargar el archivo
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName); // Usa el nombre personalizado del archivo
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link); // Limpieza del DOM

      // Verificar si el backend envió información adicional en la respuesta
      if (response.headers['content-disposition']?.includes('duplicados')) {
        alert('Descargaste un archivo con duplicados.');
      } else if (response.headers['content-disposition']?.includes('estructura')) {
        alert('Descargaste un archivo con la estructura completa.');
      } else {
        alert('Archivo descargado con éxito.');
      }
    } catch (error) {
      console.error('Error al descargar el archivo:', error);
      alert('Error al intentar descargar el archivo. Revisa la conexión con el backend.');
    }
  };

  return (
    <button className="btn download-btn" onClick={handleDownload}>
      Descargar Archivo
    </button>
  );
};

export default FileDownload;
