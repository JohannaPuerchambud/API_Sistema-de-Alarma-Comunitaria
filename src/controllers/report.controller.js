// controllers/report.controller.js
import { pool } from "../config/db.js";

export const createReport = async (req, res) => {
  try {
    const { id: user_id, neighborhood: neighborhood_id, role } = req.user;

    // Solo el rol "Usuario" (3) reporta desde móvil en HU-006
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

    res.status(201).json({ message: "Reporte creado correctamente", report: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Feed del barrio (para que el usuario vea reportes del barrio)
export const getNeighborhoodReports = async (req, res) => {
  try {
    const { neighborhood: neighborhood_id, role } = req.user;

    // Usuario (3) solo ve su barrio; Admins podrían ver más (te servirá luego para HU-010)
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

// Mis reportes (opcional pero útil)
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
