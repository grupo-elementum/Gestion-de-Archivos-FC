import React, { useState } from 'react';
import './ButtonPanel.css';
import FileDownload from '../FileHandler/FileDownload.js'; // Componente para descargar
import PreviewModal from '../FileHandler/PreviewModal.js'; // Componente para mostrar el modal de previsualización
import axios from 'axios';

const ButtonPanel = ({ onUpload }) => {
  const [data, setData] = useState(null); // Datos de previsualización
  const [showModal, setShowModal] = useState(false); // Estado para mostrar/ocultar el modal

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        const formData = new FormData();
        formData.append('file', file);

        // Llamada al backend para previsualizar el archivo
        const response = await axios.post('http://localhost:4000/api/preview', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        if (response.data.success) {
          setData(response.data.data); // Guardamos los datos del backend
          setShowModal(true); // Mostramos el modal
        } else {
          alert('No se pudo previsualizar el archivo.');
        }
      } catch (error) {
        console.error('Error al previsualizar el archivo:', error);
        alert('Error en previsualización: Archivo rechazado: Estructura de columnas incorrecta');
      }
    }
  };

  const handleUploadClick = () => {
    // Activa el input de archivo oculto
    document.getElementById('file-input').click();
  };

  return (
    <div className="button-panel">
      {/* Botón Descargar Archivo con círculo al comienzo */}
      <div className="button-group">
        <div className="circle">
          <span className="icon">⬇</span>
        </div>
        <FileDownload className="btn download-btn" />
      </div>

      {/* Botón Subir Archivo con círculo al final */}
      <div className="button-group">
        <button className="btn upload-btn" onClick={handleUploadClick}>
          Subir Archivo
        </button>
        <div className="circle">
          <span className="icon">⬆</span>
        </div>
        <input
          id="file-input"
          type="file"
          className="file-input"
          onChange={handleFileChange}
        />
      </div>

      {/* Modal de previsualización */}
      {showModal && (
        <PreviewModal
          data={data}
          onConfirm={() => setShowModal(false)}
          onCancel={() => setShowModal(false)}
        />
      )}
    </div>
  );

};

export default ButtonPanel;
