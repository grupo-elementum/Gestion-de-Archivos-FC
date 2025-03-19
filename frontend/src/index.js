import React from 'react'; // Importa React para usar JSX
import ReactDOM from 'react-dom/client'; // Importa ReactDOM para interactuar con el DOM
import './index.css'; // Importa los estilos globales
import App from './App.js'; // Importa el componente principal App

// Selecciona el contenedor raíz en el DOM
const root = ReactDOM.createRoot(document.getElementById('root'));

// Renderiza la aplicación React en el contenedor raíz
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);