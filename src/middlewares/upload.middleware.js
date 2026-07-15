import multer from "multer";

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
    return;
  }

  const error = new Error(
    "La imagen no tiene un formato compatible (jpeg, png, webp o gif).",
  );
  error.code = "UNSUPPORTED_IMAGE_TYPE";
  cb(error, false);
};

const imageUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
}).single("image");

export const uploadImage = (req, res, next) => {
  imageUpload(req, res, (error) => {
    if (!error) {
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