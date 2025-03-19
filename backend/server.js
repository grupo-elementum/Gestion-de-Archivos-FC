const express = require("express");
const cors = require("cors");
const fileRoutes = require("./routes/fileRoutes");
const errorHandler = require("./middleware/errorHandler");
const path = require("path");
const bodyParser = require('body-parser');

const app = express();



// Middleware
app.use(cors());
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json({ limit: '50mb' })); // Aumenta el límite del JSON
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true })); // Aumenta el límite de formularios codificados

app.use("/uploads", express.static(path.join(__dirname, "uploads")));


// Rutas
app.use("/api", fileRoutes); // Todas las rutas de fileRoutes estarán bajo el prefijo /api

// Levantar el servidor
const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
