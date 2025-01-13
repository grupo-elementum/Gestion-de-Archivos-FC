import React from 'react';
import './PreviewModal.css';

const formatDate = (date) => {
  // Convertir el número de fecha a formato válido
  const parsedDate = new Date((date - 25569) * 86400 * 1000); // Convertir el formato Excel a Date
  return parsedDate.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
};

const PreviewModal = ({ data, onConfirm, onCancel }) => {
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        {/* Cruz para cerrar el modal */}
        <button className="modal-close" onClick={onCancel}>
          &times;
        </button>
        <h2>Previsualización de Datos</h2>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Id Producto</th>
                <th>Id Marca</th>
                <th>Id Modelo</th>
                <th>Nro Serie</th>
                <th>Id Cliente</th>
                <th>Id Ubicación</th>
                <th>Id Estado</th>
                <th>Id Servicio</th>
                <th>Sector</th>
                <th>Fecha Desde del Servicio</th>
                <th>Fecha Modificación</th>
              </tr>
            </thead>
            <tbody>
              {data &&
                data.map((row, index) => (
                  <tr key={index}>
                    <td>{row.idproducto}</td>
                    <td>{row.Idmarca}</td>
                    <td>{row.Idmodelo}</td>
                    <td>{row.nro_serie}</td>
                    <td>{row.Idcliente}</td>
                    <td>{row.Idubicacion}</td>
                    <td>{row.Idestado}</td>
                    <td>{row.Idservicio}</td>
                    <td>{row['Sector ']}</td>
                    <td>{formatDate(row['fecha_desde del servicio'])}</td>
                    <td>{formatDate(row.Fecha_modificacion)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="modal-actions fixed-actions">
          <button className="confirm-btn" onClick={onConfirm}>
            Confirmar
          </button>
          <button className="cancel-btn" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};

export default PreviewModal;
