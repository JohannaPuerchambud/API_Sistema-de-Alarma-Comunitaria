import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { pool } from "./config/db.js";
import { getCurrentUser } from "./services/current-user.service.js";
import {
  broadcastNeighborhoodChatMessage,
  createNeighborhoodChatMessage,
  isAllowedChatImageUrl,
  validateChatPayload,
} from "./services/chat-message.service.js";
import { createProtectedMediaUrl } from "./services/protected-media.service.js";

const CHAT_RATE_WINDOW_MS = 10_000;
const CHAT_RATE_LIMIT = 10;

export { isAllowedChatImageUrl };

export const initSocket = (httpServer) => {
  const allowedOrigins = new Set([
    "https://app-sistema-de-alarma-comunitaria.onrender.com",
    "http://localhost:4200",
    ...(process.env.CORS_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  ]);

  const io = new Server(httpServer, {
    cors: {
      origin: [...allowedOrigins],
      methods: ["GET", "POST"],
    },
    maxHttpBufferSize: 1_000_000,
    pingInterval: 25_000,
    pingTimeout: 60_000,
  });

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace("Bearer ", "");

      if (!token) return next(new Error("NO_TOKEN"));

      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const currentUser = await getCurrentUser(payload.id);
      if (!currentUser) return next(new Error("INVALID_USER"));

      socket.user = currentUser;
      next();
    } catch {
      next(new Error("INVALID_TOKEN"));
    }
  });

  io.on("connection", async (socket) => {
    const { id, neighborhood, role } = socket.user;

    if (![2, 3].includes(Number(role))) {
      socket.emit(
        "error_message",
        "Solo miembros del barrio pueden usar el chat.",
      );
      socket.disconnect(true);
      return;
    }

    if (!neighborhood) {
      socket.emit("error_message", "Tu usuario no tiene barrio asignado.");
      socket.disconnect(true);
      return;
    }

    const room = `neighborhood_${neighborhood}`;
    socket.join(room);
    socket.join(`user_${id}`);

    try {
      const { rows } = await pool.query(
        `
        SELECT cm.message_id, cm.message, cm.image_url, cm.created_at,
               u.user_id, u.name, u.last_name
        FROM chat_messages cm
        JOIN users u ON u.user_id = cm.user_id
        WHERE cm.neighborhood_id = $1
        ORDER BY cm.created_at DESC
        LIMIT 50
        `,
        [neighborhood],
      );

      const history = await Promise.all(
        rows.reverse().map(async (message) => ({
          ...message,
          image_url: await createProtectedMediaUrl(message.image_url),
        })),
      );
      socket.emit("history", history);
    } catch {
      socket.emit("error_message", "No se pudo cargar el historial.");
    }

    const recentMessageTimes = [];

    socket.on("send_message", async (payload) => {
      let text;
      let imageUrl;
      try {
        ({ text, imageUrl } = validateChatPayload(payload));
      } catch (error) {
        socket.emit("error_message", error.message);
        return;
      }

      const now = Date.now();
      while (
        recentMessageTimes.length > 0 &&
        recentMessageTimes[0] <= now - CHAT_RATE_WINDOW_MS
      ) {
        recentMessageTimes.shift();
      }
      if (recentMessageTimes.length >= CHAT_RATE_LIMIT) {
        socket.emit(
          "error_message",
          "Estás enviando mensajes demasiado rápido.",
        );
        return;
      }
      recentMessageTimes.push(now);

      try {
        const message = await createNeighborhoodChatMessage({
          userId: id,
          neighborhoodId: neighborhood,
          text,
          imageUrl,
        });
        broadcastNeighborhoodChatMessage({ io, message });
      } catch (error) {
        if (Number(error.status) === 403) {
          socket.emit("error_message", error.message);
          socket.disconnect(true);
          return;
        }
        socket.emit("error_message", "No se pudo enviar el mensaje.");
      }
    });
  });

  return io;
};
