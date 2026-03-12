// controllers/report.controller.js
import { pool } from "../config/db.js";

export const createReport = async (req, res) => {
  try {
    const { id: user_id, neighborhood: neighborhood_id, role } = req.user;

    if (Number(role) !== 3) {
      return res.status(403).json({ message: "Solo el rol Usuario puede crear reportes." });
    }

    const { title, description } = req.body;

    if (!neighborhood_id) {
      return res.status(400).json({ message: "Tu usuario no tiene barrio asignado." });
    }

    if (!title || !description) {
      return res.status(400).json({ message: "title y description son obligatorios." });
    }

    if (String(title).trim().length > 100) {
      return res.status(400).json({ message: "El título no puede superar 100 caracteres." });
    }

    const { rows } = await pool.query(
      `INSERT INTO reports (user_id, neighborhood_id, title, description, image_url, created_at)
       VALUES ($1, $2, $3, $4, NULL, NOW())
       RETURNING report_id, user_id, neighborhood_id, title, description, image_url, created_at`,
      [user_id, neighborhood_id, String(title).trim(), String(description).trim()]
    );

    // 1. Crear el mensaje automático para el chat enriquecido
    const alertMessage = `🚨 ALERTA VECINAL 🚨\nMotivo: ${String(title).trim()}\nDetalle: ${String(description).trim()}`;

    const chatResult = await pool.query(
      `INSERT INTO chat_messages (user_id, neighborhood_id, message, created_at)
   VALUES ($1, $2, $3, NOW())
   RETURNING message_id, message, created_at`,
      [user_id, neighborhood_id, alertMessage]
    );

    // 2. Extraer la instancia de Socket.IO que guardamos en server.js
    const io = req.app.get("io");

    // 3. Emitir el mensaje a todos los vecinos conectados en esa sala
    io.to(`neighborhood_${neighborhood_id}`).emit("new_message", {
      message_id: chatResult.rows[0].message_id,
      message: chatResult.rows[0].message,
      created_at: chatResult.rows[0].created_at,
      user_id: user_id,
      name: req.user.name,
      last_name: req.user.last_name || null,
      neighborhood_id: neighborhood_id,
    });

    res.status(201).json({ message: "Reporte creado correctamente", report: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getNeighborhoodReports = async (req, res) => {
  try {
    const { neighborhood: neighborhood_id, role } = req.user;

    if (Number(role) === 3 && !neighborhood_id) {
      return res.status(400).json({ message: "Tu usuario no tiene barrio asignado." });
    }

    const { rows } = await pool.query(
      `SELECT r.report_id,
              r.title,
              r.description,
              r.image_url,
              r.created_at,
              u.user_id,
              u.name,
              u.last_name
       FROM reports r
       INNER JOIN users u ON u.user_id = r.user_id
       WHERE r.neighborhood_id = $1
       ORDER BY r.created_at DESC`,
      [neighborhood_id]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getMyReports = async (req, res) => {
  try {
    const { id: user_id } = req.user;

    const { rows } = await pool.query(
      `SELECT report_id, neighborhood_id, title, description, image_url, created_at
       FROM reports
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [user_id]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
