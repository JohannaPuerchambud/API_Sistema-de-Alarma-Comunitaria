// controllers/chat.controller.js
import { pool } from "../config/db.js";
import admin from "../config/firebase.js";

export const getNeighborhoodMessages = async (req, res) => {
  try {
    const { neighborhood } = req.user; // viene del JWT (middleware)
    const requestedLimit = Number(req.query.limit ?? 50);
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 50;

    if (!neighborhood) {
      return res.status(400).json({ message: "Tu usuario no tiene barrio asignado." });
    }

    const q = await pool.query(
      `SELECT cm.message_id, cm.message, cm.image_url, cm.created_at,
              u.user_id, u.name, u.last_name
       FROM chat_messages cm
       JOIN users u ON u.user_id = cm.user_id
       WHERE cm.neighborhood_id = $1
       ORDER BY cm.created_at DESC
       LIMIT $2`,
      [neighborhood, limit],
    );

    res.json(q.rows.reverse()); // para que salga de antiguo->nuevo
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// ✅ Endpoint para subir imágenes del chat a Firebase Storage desde el backend
export const uploadChatImage = async (req, res) => {
  try {
    if (!req.user.neighborhood) {
      return res.status(400).json({ message: "Tu usuario no tiene barrio asignado." });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No se recibió ninguna imagen." });
    }

    const bucket = admin.storage().bucket();
    const fileName = `chat_images/chat_${Date.now()}_${req.file.originalname}`;
    const file = bucket.file(fileName);

    await file.save(req.file.buffer, {
      metadata: {
        contentType: req.file.mimetype,
      },
    });

    // Generar URL firmada (compatible con Uniform Bucket-Level Access)
    const [signedUrl] = await file.getSignedUrl({
      action: "read",
      expires: "01-01-2035",
    });

    res.status(200).json({ image_url: signedUrl });
  } catch (err) {
    console.error("Error subiendo imagen del chat:", err);
    res.status(500).json({ message: "Error al subir la imagen." });
  }
};
