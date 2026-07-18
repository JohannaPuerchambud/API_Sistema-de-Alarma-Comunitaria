import { pool } from "../config/db.js";
import { storageBucketName } from "../config/firebase.js";
import { getCurrentUser } from "./current-user.service.js";
import {
  createProtectedMediaUrl,
  parseStorageReference,
} from "./protected-media.service.js";
import { sendNeighborhoodPush } from "./push-notification.service.js";

export const MAX_CHAT_MESSAGE_LENGTH = 2000;
const CHAT_RATE_WINDOW_MS = 10_000;
const CHAT_RATE_LIMIT = 10;
const recentRestMessageTimes = new Map();

export const isAllowedChatImageUrl = (value) => {
  const storageReference = parseStorageReference(value);
  if (storageReference) {
    return storageReference.bucket === storageBucketName;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;

    const firebasePath = `/v0/b/${encodeURIComponent(storageBucketName)}/o/`;
    const isFirebaseDownload =
      url.hostname === "firebasestorage.googleapis.com" &&
      url.pathname.startsWith(firebasePath) &&
      url.searchParams.get("alt") === "media" &&
      Boolean(url.searchParams.get("token"));

    const isLegacySignedUrl =
      (url.hostname === "storage.googleapis.com" &&
        url.pathname.startsWith(`/${storageBucketName}/`)) ||
      url.hostname === `${storageBucketName}.storage.googleapis.com`;

    return isFirebaseDownload || isLegacySignedUrl;
  } catch {
    return false;
  }
};

export const validateChatPayload = (payload) => {
  const text = String(payload?.message || "").trim();
  const imageUrl = String(payload?.image_url || "").trim() || null;

  if (!text && !imageUrl) {
    const error = new Error("Escribe un mensaje o adjunta una imagen.");
    error.status = 400;
    throw error;
  }

  if (text.length > MAX_CHAT_MESSAGE_LENGTH) {
    const error = new Error("El mensaje no puede superar 2000 caracteres.");
    error.status = 400;
    throw error;
  }

  if (imageUrl && !isAllowedChatImageUrl(imageUrl)) {
    const error = new Error("La URL de imagen no es válida.");
    error.status = 400;
    throw error;
  }

  return { text, imageUrl };
};

export const enforceChatRateLimit = (userId) => {
  const now = Date.now();
  const recent = (recentRestMessageTimes.get(userId) || []).filter(
    (timestamp) => timestamp > now - CHAT_RATE_WINDOW_MS,
  );

  if (recent.length >= CHAT_RATE_LIMIT) {
    const error = new Error("Estás enviando mensajes demasiado rápido.");
    error.status = 429;
    throw error;
  }

  recent.push(now);
  recentRestMessageTimes.set(userId, recent);
};

export const createNeighborhoodChatMessage = async ({
  userId,
  neighborhoodId,
  text,
  imageUrl,
  mediaOrigin,
}) => {
  const currentUser = await getCurrentUser(userId);
  if (
    !currentUser ||
    ![2, 3].includes(Number(currentUser.role)) ||
    Number(currentUser.neighborhood) !== Number(neighborhoodId)
  ) {
    const error = new Error("Tu sesión o permisos cambiaron.");
    error.status = 403;
    throw error;
  }

  const { rows } = await pool.query(
    `
    INSERT INTO chat_messages (user_id, neighborhood_id, message, image_url, created_at)
    VALUES ($1, $2, $3, $4, NOW())
    RETURNING message_id, message, image_url, created_at
    `,
    [userId, neighborhoodId, text || "📷 Foto", imageUrl],
  );

  const message = {
    message_id: rows[0].message_id,
    message: rows[0].message,
    image_url: await createProtectedMediaUrl(rows[0].image_url, {
      origin: mediaOrigin,
    }),
    created_at: rows[0].created_at,
    user_id: userId,
    name: currentUser.name,
    last_name: currentUser.last_name || null,
    neighborhood_id: neighborhoodId,
  };

  return message;
};

export const broadcastNeighborhoodChatMessage = ({ io, message }) => {
  if (io) {
    io.to(`neighborhood_${message.neighborhood_id}`).emit(
      "new_message",
      message,
    );
  }

  sendNeighborhoodPush({
    neighborhoodId: message.neighborhood_id,
    excludeUserId: message.user_id,
    title: `Nuevo mensaje de ${message.name}`,
    body: message.message || "Foto enviada al chat",
    data: {
      type: "chat",
      neighborhood_id: message.neighborhood_id,
      message_id: message.message_id,
    },
  })
    .then((delivery) => {
      console.log("Entrega push del chat:", delivery);
    })
    .catch((pushError) => {
      console.error("Error enviando push del chat:", pushError);
    });
};
