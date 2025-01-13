import React, { useState } from 'react'; 
import * as XLSX from 'xlsx'; // Importar la biblioteca XLSX
import ButtonPanel from './components/ButtonPanel/ButtonPanel.js';
import PreviewModal from './components/FileHandler/PreviewModal.js';
import './App.css';

const App = () => {
  const [previewData, setPreviewData] = useState(null); // Datos de previsualización
  const [file, setFile] = useState(null); // Almacena el archivo seleccionado
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleFileUpload = (file) => {
    const reader = new FileReader(); // Crea un lector de archivos

    reader.onload = (e) => {
      try {
        // Lee el contenido del archivo como binario
        const workbook = XLSX.read(e.target.result, { type: 'binary' });
        const sheetName = workbook.SheetNames[0]; // Usa la primera hoja del Excel
        const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]); // Convierte la hoja a JSON

        console.log("Datos del archivo:", sheetData); // Muestra los datos en la consola (para depuración)
        setPreviewData(sheetData); // Actualiza `previewData` con los datos procesados
        setIsModalOpen(true); // Abre el modal
      } catch (error) {
        console.error("Error al procesar el archivo Excel:", error); // Maneja errores
      }
    };

    reader.readAsBinaryString(file); // Lee el archivo como binario
    setFile(file); // Guarda el archivo para enviarlo al backend más adelante
  };

  const handleConfirm = async () => {
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://localhost:3000/api/upload", {
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
        <i className="fas fa-folder-open"></i> Gestión de Archivos 📁
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
