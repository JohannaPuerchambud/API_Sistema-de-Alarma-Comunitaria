// socket.js
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { pool } from "./config/db.js";
import { getCurrentUser } from "./services/current-user.service.js";

const MAX_CHAT_MESSAGE_LENGTH = 2000;
const CHAT_RATE_WINDOW_MS = 10_000;
const CHAT_RATE_LIMIT = 10;

const isAllowedChatImageUrl = (value) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "firebasestorage.googleapis.com" &&
      url.pathname.startsWith("/v0/b/")
    );
  } catch {
    return false;
  }
};

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
    } catch (e) {
      next(new Error("INVALID_TOKEN"));
    }
  });

  io.on("connection", async (socket) => {
    const { id, neighborhood, role } = socket.user;

    if (![2, 3].includes(Number(role))) {
      socket.emit("error_message", "Solo miembros del barrio pueden usar el chat.");
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

      socket.emit("history", rows.reverse());
    } catch (e) {
      socket.emit("error_message", "No se pudo cargar el historial.");
    }

    const recentMessageTimes = [];

    socket.on("send_message", async (payload) => {
      const text = String(payload?.message || "").trim();
      const imageUrl = String(payload?.image_url || "").trim() || null;

      if (!text && !imageUrl) return;

      if (text.length > MAX_CHAT_MESSAGE_LENGTH) {
        socket.emit("error_message", "El mensaje no puede superar 2000 caracteres.");
        return;
      }

      if (imageUrl && !isAllowedChatImageUrl(imageUrl)) {
        socket.emit("error_message", "La URL de imagen no es válida.");
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
        socket.emit("error_message", "Estás enviando mensajes demasiado rápido.");
        return;
      }
      recentMessageTimes.push(now);

      try {
        const currentUser = await getCurrentUser(id);
        if (
          !currentUser ||
          ![2, 3].includes(Number(currentUser.role)) ||
          Number(currentUser.neighborhood) !== Number(neighborhood)
        ) {
          socket.emit("error_message", "Tu sesion o permisos cambiaron.");
          socket.disconnect(true);
          return;
        }

        const { rows } = await pool.query(
          `
          INSERT INTO chat_messages (user_id, neighborhood_id, message, image_url, created_at)
          VALUES ($1, $2, $3, $4, NOW())
          RETURNING message_id, message, image_url, created_at
          `,
          [id, neighborhood, text || "📷 Foto", imageUrl],
        );

        const msg = {
          message_id: rows[0].message_id,
          message: rows[0].message,
          image_url: rows[0].image_url,
          created_at: rows[0].created_at,
          user_id: id,
          name: socket.user.name,
          last_name: socket.user.last_name || null,
          neighborhood_id: neighborhood,
        };

        io.to(room).emit("new_message", msg);
      } catch (e) {
        socket.emit("error_message", "No se pudo enviar el mensaje.");
      }
    });
  });

  return io;
};
