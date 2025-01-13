const express = require("express");
const multer = require("multer");
const path = require("path");
const { uploadFile, previewFile, downloadData } = require("../controllers/fileController");

const router = express.Router();

// Configuración de multer para subir archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../uploads"));
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

// Rutas
router.post("/upload", upload.single("file"), uploadFile); // Subir archivos
// router.get("/download/:id", downloadFile); // Descargar un archivo específico por ID
router.post("/preview", upload.single("file"), previewFile); // Previsualizar archivos
router.get("/download-database", downloadData); // Descargar datos desde la base de datos

module.exports = router;
