import { pool } from "../config/db.js";
import { uploadImageToFirebase } from "../services/firebase-storage.service.js";
import {
  broadcastNeighborhoodChatMessage,
  createNeighborhoodChatMessage,
  enforceChatRateLimit,
  validateChatPayload,
} from "../services/chat-message.service.js";
import {
  createProtectedMediaUrl,
  requestOrigin,
} from "../services/protected-media.service.js";

const CHAT_IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;
const sentMessagesByRequest = new Map();

const getChatRequestKey = (req, userId) => {
  const rawKey = String(req.get("Idempotency-Key") || "").trim();
  if (!rawKey || rawKey.length > 128) return null;

  const now = Date.now();
  for (const [key, entry] of sentMessagesByRequest.entries()) {
    if (entry.expiresAt <= now) sentMessagesByRequest.delete(key);
  }

  return `${userId}:${rawKey}`;
};

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

    const origin = requestOrigin(req);
    const messages = await Promise.all(
      q.rows.reverse().map(async (message) => ({
        ...message,
        image_url: await createProtectedMediaUrl(message.image_url, { origin }),
      })),
    );
    res.json(messages);
  } catch (error) {
    console.error("Error consultando mensajes del barrio:", error);
    res.status(500).json({ message: "Error interno del servidor." });
  }
};

export const sendNeighborhoodMessage = async (req, res) => {
  try {
    const { id, neighborhood } = req.user;
    const { text, imageUrl } = validateChatPayload(req.body);

    if (!neighborhood) {
      return res
        .status(400)
        .json({ message: "Tu usuario no tiene barrio asignado." });
    }

    const requestKey = getChatRequestKey(req, id);
    const cachedMessage = requestKey
      ? sentMessagesByRequest.get(requestKey)
      : null;
    if (cachedMessage && cachedMessage.expiresAt > Date.now()) {
      return res.status(201).json(cachedMessage.message);
    }

    enforceChatRateLimit(id);

    const message = await createNeighborhoodChatMessage({
      userId: id,
      neighborhoodId: neighborhood,
      text,
      imageUrl,
      mediaOrigin: requestOrigin(req),
    });

    if (requestKey) {
      sentMessagesByRequest.set(requestKey, {
        message,
        expiresAt: Date.now() + CHAT_IDEMPOTENCY_TTL_MS,
      });
    }

    broadcastNeighborhoodChatMessage({
      io: req.app.get("io"),
      message,
    });

    res.status(201).json(message);
  } catch (error) {
    console.error("Error enviando mensaje del barrio:", error);
    const status = Number(error.status) || 500;
    res.status(status).json({
      message:
        status >= 500 ? "No se pudo enviar el mensaje." : error.message,
    });
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
      return res.status(400).json({
        message:
          req.uploadWarning?.message || "No se recibió ninguna imagen.",
        code: req.uploadWarning?.code || "image_missing",
      });
    }

    const result = await uploadImageToFirebase({
      upload: req.file,
      folder: "chat_images",
      prefix: "chat",
    });

    res.status(200).json({
      image_url: result.imageUrl,
      access_method: result.accessMethod,
    });
  } catch (error) {
    console.error("Error subiendo imagen del chat:", error);
    res.status(503).json({
      message:
        "No se pudo guardar la imagen. Puedes continuar enviando mensajes de texto.",
      code: error.code || "storage_upload_failed",
    });
  }
};
