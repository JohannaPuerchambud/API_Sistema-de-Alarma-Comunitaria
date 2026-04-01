// controllers/chat.controller.js
import { pool } from "../config/db.js";

export const getNeighborhoodMessages = async (req, res) => {
  try {
    const { neighborhood } = req.user; // viene del JWT (middleware)
    const { limit = 50 } = req.query;

    const q = await pool.query(
      `SELECT cm.message_id, cm.message, cm.created_at,
              u.user_id, u.name, u.last_name
       FROM chat_messages cm
       JOIN users u ON u.user_id = cm.user_id
       WHERE cm.neighborhood_id = $1
       ORDER BY cm.created_at DESC
       LIMIT $2`,
      [neighborhood, Number(limit)],
    );

    res.json(q.rows.reverse()); // para que salga de antiguo->nuevo
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
