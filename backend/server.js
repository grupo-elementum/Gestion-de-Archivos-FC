const express = require("express");
const cors = require("cors");
const fileRoutes = require("./routes/fileRoutes");
const errorHandler = require("./middleware/errorHandler");
const path = require("path");


const app = express();



// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(path.join(__dirname, "uploads")));


// Rutas
app.use("/api", fileRoutes); // Todas las rutas de fileRoutes estarán bajo el prefijo /api

// Levantar el servidor
const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
