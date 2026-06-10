import { pool } from "../config/db.js";

// ── Listar barrios con nombre de UPC y datos del representante (role_id=2) ──
export const getNeighborhoods = async (req, res) => {
  try {
    const { role, neighborhood } = req.user || {};
    let query;
    let values = [];

    const baseSelect = `
      SELECT
        n.neighborhood_id,
        n.name,
        n.description,
        n.boundary,
        n.alarm_number,
        n.upc_id,
        n.created_at,
        upc.name         AS upc_name,
        adm.user_id      AS admin_user_id,
        adm.name         AS admin_name,
        adm.last_name    AS admin_last_name,
        adm.email        AS admin_email,
        adm.phone        AS admin_phone
      FROM neighborhoods n
      LEFT JOIN upcs upc ON upc.upc_id = n.upc_id
      LEFT JOIN users adm ON adm.neighborhood_id = n.neighborhood_id
                         AND adm.role_id = 2
    `;

    if (role === 1) {
      query = `${baseSelect} ORDER BY n.name ASC`;
    } else if (role === 2) {
      query = `${baseSelect} WHERE n.neighborhood_id = $1 ORDER BY n.name ASC`;
      values = [neighborhood];
    } else {
      return res.status(403).json({ message: "No autorizado" });
    }

    const { rows } = await pool.query(query, values);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getNeighborhoodById = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
        n.neighborhood_id,
        n.name,
        n.description,
        n.boundary,
        n.alarm_number,
        n.upc_id,
        n.created_at,
        upc.name         AS upc_name,
        adm.user_id      AS admin_user_id,
        adm.name         AS admin_name,
        adm.last_name    AS admin_last_name,
        adm.email        AS admin_email,
        adm.phone        AS admin_phone
       FROM neighborhoods n
       LEFT JOIN upcs upc ON upc.upc_id = n.upc_id
       LEFT JOIN users adm ON adm.neighborhood_id = n.neighborhood_id
                          AND adm.role_id = 2
       WHERE n.neighborhood_id = $1`,
      [req.params.id],
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "Barrio no encontrado" });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const createNeighborhood = async (req, res) => {
  try {
    const {
      name,
      description,
      boundary = null,
      alarm_number = null,
      upc_id = null,
    } = req.body;

    const query = `
      INSERT INTO neighborhoods (name, description, boundary, alarm_number, upc_id, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *`;
    const result = await pool.query(query, [
      name,
      description,
      boundary,
      alarm_number,
      upc_id || null,
    ]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateNeighborhood = async (req, res) => {
  try {
    const {
      name,
      description,
      boundary = null,
      alarm_number = null,
      upc_id = null,
    } = req.body;
    const { id } = req.params;

    const query = `
      UPDATE neighborhoods
      SET name = $1,
          description = $2,
          boundary = $3,
          alarm_number = $4,
          upc_id = $5
      WHERE neighborhood_id = $6
      RETURNING *`;

    const result = await pool.query(query, [
      name,
      description,
      boundary,
      alarm_number,
      upc_id || null,
      id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Barrio no encontrado" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === "22P02") {
      return res
        .status(400)
        .json({ error: 'Formato de "boundary" (JSONB) inválido.' });
    }
    res.status(500).json({ error: err.message });
  }
};

export const deleteNeighborhood = async (req, res) => {
  try {
    const check = await pool.query(
      "SELECT 1 FROM neighborhoods WHERE neighborhood_id = $1",
      [req.params.id],
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ message: "Barrio no encontrado" });
    }

    await pool.query("DELETE FROM neighborhoods WHERE neighborhood_id = $1", [
      req.params.id,
    ]);
    res.json({ message: "Barrio eliminado correctamente" });
  } catch (err) {
    if (err.code === "23503") {
      return res.status(400).json({
        error:
          "No se puede eliminar el barrio porque tiene usuarios asignados.",
      });
    }
    res.status(500).json({ error: err.message });
  }
};

// ─── Representante del barrio ────────────────────────────────────────────────

/**
 * GET /api/neighborhoods/:id/admin
 * Devuelve el usuario con role_id = 2 asignado a este barrio (representante).
 */
export const getNeighborhoodAdmin = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT user_id, name, last_name, email, phone
       FROM users
       WHERE role_id = 2 AND neighborhood_id = $1
       LIMIT 1`,
      [req.params.id],
    );
    // Devuelve null si no hay representante asignado (válido en front)
    res.json(rows.length > 0 ? rows[0] : null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * PUT /api/neighborhoods/:id/admin
 * Body: { admin_user_id: number | null }
 *
 * Asigna un Admin de barrio (role_id=2) al barrio actualizando su
 * neighborhood_id. Si admin_user_id es null, desvincula el admin actual.
 * No crea ningún campo nuevo en neighborhoods.
 */
export const setNeighborhoodAdmin = async (req, res) => {
  const { id } = req.params; // neighborhood_id
  const { admin_user_id } = req.body;

  try {
    // 1. Desvincular el admin previo de este barrio (si existe)
    await pool.query(
      `UPDATE users SET neighborhood_id = NULL
       WHERE role_id = 2 AND neighborhood_id = $1`,
      [id],
    );

    if (admin_user_id) {
      // 2. Verificar que el usuario existe y tiene role_id = 2
      const check = await pool.query(
        `SELECT user_id FROM users WHERE user_id = $1 AND role_id = 2`,
        [admin_user_id],
      );
      if (check.rows.length === 0) {
        return res.status(404).json({
          message: "Usuario no encontrado o no tiene rol Admin Barrio.",
        });
      }

      // 3. Asignar el nuevo admin al barrio
      await pool.query(
        `UPDATE users SET neighborhood_id = $1 WHERE user_id = $2`,
        [id, admin_user_id],
      );
    }

    res.json({ message: "Representante actualizado correctamente." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
