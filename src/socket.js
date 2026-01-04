// socket.js
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { pool } from "./config/db.js";

export const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace("Bearer ", "");

      if (!token) return next(new Error("NO_TOKEN"));

      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = payload; 
      next();
    } catch (e) {
      next(new Error("INVALID_TOKEN"));
    }
  });

  io.on("connection", async (socket) => {
    const { id, neighborhood, role } = socket.user;

    if (Number(role) !== 3) {
      socket.emit("error_message", "Solo usuarios pueden usar el chat.");
      socket.disconnect(true);
      return;
    }

    const room = `neighborhood_${neighborhood}`;
    socket.join(room);

    try {
      const { rows } = await pool.query(
        `
        SELECT cm.message_id, cm.message, cm.created_at,
               u.user_id, u.name, u.last_name
        FROM chat_messages cm
        JOIN users u ON u.user_id = cm.user_id
        WHERE cm.neighborhood_id = $1
        ORDER BY cm.created_at DESC
        LIMIT 50
        `,
        [neighborhood]
      );

      socket.emit("history", rows.reverse());
    } catch (e) {
      socket.emit("error_message", "No se pudo cargar el historial.");
    }

    socket.on("send_message", async (payload) => {
      const text = (payload?.message || "").trim();
      if (!text) return;

      try {
        const { rows } = await pool.query(
          `
          INSERT INTO chat_messages (user_id, neighborhood_id, message, created_at)
          VALUES ($1, $2, $3, NOW())
          RETURNING message_id, message, created_at
          `,
          [id, neighborhood, text]
        );

        const msg = {
          message_id: rows[0].message_id,
          message: rows[0].message,
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
