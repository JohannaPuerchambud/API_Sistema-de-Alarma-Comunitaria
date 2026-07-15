import crypto from "crypto";

import { pool } from "../config/db.js";
import admin from "../config/firebase.js";

const firebaseDownloadUrl = (bucketName, fileName, token) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(fileName)}?alt=media&token=${token}`;

export const getNeighborhoodMessages = async (req, res) => {
  try {
    const { neighborhood } = req.user;
    const requestedLimit = Number(req.query.limit ?? 50);
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 50;

    if (!neighborhood) {
      return res
        .status(400)
        .json({ message: "Tu usuario no tiene barrio asignado." });
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

    res.json(q.rows.reverse());
  } catch (error) {
    console.error("Error consultando mensajes del barrio:", error);
    res.status(500).json({ message: "Error interno del servidor." });
  }
};

export const uploadChatImage = async (req, res) => {
  try {
    if (!req.user.neighborhood) {
      return res
        .status(400)
        .json({ message: "Tu usuario no tiene barrio asignado." });
    }

    if (!req.file) {
      return res
        .status(400)
        .json({ message: "No se recibió ninguna imagen." });
    }

    const bucket = admin.storage().bucket();
    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileName = `chat_images/chat_${Date.now()}_${safeName}`;
    const downloadToken = crypto.randomUUID();
    const file = bucket.file(fileName);

    await file.save(req.file.buffer, {
      metadata: {
        contentType: req.file.mimetype,
        cacheControl: "private, max-age=3600",
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });

    res.status(200).json({
      image_url: firebaseDownloadUrl(bucket.name, fileName, downloadToken),
    });
  } catch (error) {
    console.error("Error subiendo imagen del chat:", error);
    res.status(500).json({ message: "Error al subir la imagen." });
  }
};