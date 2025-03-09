import React, { useState } from 'react';
import axios from 'axios';
import './PreviewModal.css';

const formatDate = (date) => {
  const parsedDate = new Date((date - 25569) * 86400 * 1000);
  return parsedDate.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
};

const PreviewModal = ({ data, onConfirm, onCancel }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleConfirm = async () => {
    setIsLoading(true);
    setProgress(0);

    try {
      const response = await axios.post('http://localhost:4000/api/upload', 
        { data },
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );

      const result = response.data;
      
      if (result.resultadosPath) {
        const downloadUrl = `http://localhost:4000${result.resultadosPath}`;
        const downloadResponse = await axios.get(downloadUrl, {
          responseType: 'blob'
        });
        
        const url = window.URL.createObjectURL(new Blob([downloadResponse.data]));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'resultados_importacion.xlsx';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }

      alert(result.message || 'Archivo procesado correctamente');
      setProgress(100);
      onConfirm();

    } catch (error) {
      const errorMessage = error.response?.data?.message || 
                         error.message || 
                         'Error en la estructura del archivo';
      alert(errorMessage);
      console.error('Error en confirmación:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button 
          className="modal-close" 
          onClick={onCancel} 
          disabled={isLoading}
        >
          &times;
        </button>
        <h2>Previsualización de Datos</h2>
        
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Id Cliente</th>
                <th>Marca</th>
                <th>Marca Nueva</th>
                <th>Modelo</th>
                <th>Modelo Nuevo</th>
                <th>Nro Serie</th>
                <th>Id Producto</th>
                <th>Id Ubicación</th>
                <th>Id Estado</th>
                <th>Id Servicio</th>
                <th>Fecha Desde</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((row, index) => (
                <tr key={index}>
                  <td>{row.IdCliente}</td>
                  <td>{row.Marca}</td>
                  <td>{row.Marca_nueva}</td>
                  <td>{row.Modelo}</td>
                  <td>{row.Modelo_nuevo}</td>
                  <td>{row.Nro_Serie}</td>
                  <td>{row.IdProducto}</td>
                  <td>{row.idubicacion}</td>
                  <td>{row.idestado}</td>
                  <td>{row.IdServicio}</td>
                  <td>{formatDate(row.Fecha_Desde)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Barra de Progreso */}
        {isLoading && (
          <div className="progress-bar-container">
            <div 
              className="progress-bar" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        )}

        <div className="modal-actions fixed-actions">
          <button 
            className="confirm-btn" 
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Subiendo...' : 'Confirmar'}
          </button>
          
          <button 
            className="cancel-btn" 
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};

export default PreviewModal;