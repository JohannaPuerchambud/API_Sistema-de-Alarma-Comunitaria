import multer from "multer";

const storage = multer.memoryStorage();

const startsWith = (buffer, signature) =>
  signature.every((byte, index) => buffer[index] === byte);

/**
 * Detecta el tipo real mediante la firma binaria del archivo. Android puede
 * enviar fotos validas como application/octet-stream, por lo que no debemos
 * depender unicamente del MIME declarado por el cliente.
 */
export const detectImageMimeType = (buffer) => {
  if (!Buffer.isBuffer(buffer)) return null;

  if (buffer.length >= 3 && startsWith(buffer, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 8 &&
    startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return "image/png";
  }

  if (
    buffer.length >= 6 &&
    (buffer.subarray(0, 6).toString("ascii") === "GIF87a" ||
      buffer.subarray(0, 6).toString("ascii") === "GIF89a")
  ) {
    return "image/gif";
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
};

const unsupportedImageWarning = () => ({
  code: "UNSUPPORTED_IMAGE_TYPE",
  message: "La imagen no tiene un formato compatible (jpeg, png, webp o gif).",
});

const imageUpload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
}).single("image");

export const uploadImage = (req, res, next) => {
  imageUpload(req, res, (error) => {
    if (!error) {
      if (req.file) {
        const detectedMimeType = detectImageMimeType(req.file.buffer);
        if (!detectedMimeType) {
          req.file = null;
          req.uploadWarning = unsupportedImageWarning();
          console.warn("Imagen opcional omitida antes del controlador:", {
            code: req.uploadWarning.code,
            message: req.uploadWarning.message,
          });
        } else {
          // Normaliza el valor que se guarda en Firebase Storage.
          req.file.mimetype = detectedMimeType;
        }
      }
      next();
      return;
    }

    req.file = null;
    req.uploadWarning = {
      code:
        error instanceof multer.MulterError
          ? error.code
          : error.code || "IMAGE_REJECTED",
      message:
        error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE"
          ? "La imagen fue omitida porque supera el límite de 5 MB."
          : error.message || "La imagen fue omitida por tener un formato inválido.",
    };

    console.warn("Imagen opcional omitida antes del controlador:", {
      code: req.uploadWarning.code,
      message: req.uploadWarning.message,
    });
    next();
  });
};