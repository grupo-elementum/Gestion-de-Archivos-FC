import React, { useState } from 'react'; 
import * as XLSX from 'xlsx'; // Importar la biblioteca XLSX
import ButtonPanel from './components/ButtonPanel/ButtonPanel.js';
import PreviewModal from './components/FileHandler/PreviewModal.js';
import './App.css';

const App = () => {
  const [previewData, setPreviewData] = useState(null); // Datos de previsualización
  // const [file, setFile] = useState(null); // Almacena el archivo seleccionado
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleFileUpload = (file) => {
    const reader = new FileReader();
  
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
  
        // 1. Agregar validación básica de columnas en frontend
        const expectedColumns = [
          "IdCliente", "Marca", "Marca_nueva", "Modelo", 
          "Modelo_nuevo", "Nro_Serie", "IdProducto", 
          "idubicacion", "idestado", "IdServicio", "Fecha_Desde"
        ];
  
        const actualColumns = Object.keys(sheetData[0] || {});
        const isValid = expectedColumns.every(col => actualColumns.includes(col));
  
        if (!isValid) {
          throw new Error("Estructura incorrecta. Verifica las columnas");
        }
  
        setPreviewData(sheetData);
        setIsModalOpen(true);
  
      } catch (error) {
        alert(error.message); // Mensaje específico
        console.error("Error:", error);
      }
    };
  
    reader.readAsBinaryString(file);
  };

  const handleConfirm = async () => {
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://localhost:4000/api/upload", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Archivo subido: ${result.message}`);
        setIsModalOpen(false);
        setFile(null);
        setPreviewData(null);
      } else {
        const error = await response.json();
        alert(`Error: ${error.message}`);
      }
    } catch (err) {
      alert("Hubo un error al subir el archivo");
    }
  };

  const handleCancel = () => {
    setIsModalOpen(false); // Cierra el modal sin realizar acción
    setFile(null); // Limpia el archivo seleccionado
  };

  return (
    <div>
      <div className="page-title">
        <i className="fas fa-folder-open"></i> Gestión de Archivos FC 📁
      </div>
      <div className="app">
        <ButtonPanel onUpload={handleFileUpload} />
      </div>
      {isModalOpen && (
        <PreviewModal
          data={previewData} // Pasa los datos procesados al modal
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
};

export default App;
