// middlewares/upload.middleware.js
import multer from "multer";

// Almacenar en memoria (no en disco) para luego subir a Firebase Storage
const storage = multer.memoryStorage();

// Filtrar solo imágenes
const fileFilter = (req, file, cb) => {
  const allowedMimes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Solo se permiten imágenes (jpeg, png, webp, gif)."), false);
  }
};

export const uploadImage = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // Máximo 5 MB
  },
}).single("image"); // El campo se llamará "image" en el form-data
