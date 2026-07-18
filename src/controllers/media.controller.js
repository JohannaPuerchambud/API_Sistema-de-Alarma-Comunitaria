import admin from "../config/firebase.js";
import { verifyProtectedMediaToken } from "../services/protected-media.service.js";

export const streamProtectedImage = async (req, res) => {
  const reference = verifyProtectedMediaToken(req.params.token);
  if (!reference) {
    return res.status(403).json({
      message: "El enlace de la evidencia no es v?lido o ya expir?.",
    });
  }

  try {
    const storageFile = admin
      .storage()
      .bucket(reference.bucket)
      .file(reference.objectPath);
    const [metadata] = await storageFile.getMetadata();

    res.set({
      "Content-Type": metadata.contentType || "application/octet-stream",
      "Content-Length": metadata.size,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    });

    const stream = storageFile.createReadStream();
    stream.on("error", (error) => {
      console.error("No se pudo leer la evidencia protegida:", error);
      if (!res.headersSent) {
        res.status(404).json({ message: "La evidencia no est? disponible." });
      } else {
        res.destroy(error);
      }
    });
    stream.pipe(res);
  } catch (error) {
    console.error("No se pudo abrir la evidencia protegida:", error);
    if (!res.headersSent) {
      res.status(404).json({ message: "La evidencia no est? disponible." });
    }
  }
};
