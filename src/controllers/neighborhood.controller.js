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
    res.status(500).json({ message: "Error interno del servidor." });
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
    res.status(500).json({ message: "Error interno del servidor." });
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
    res.status(500).json({ message: "Error interno del servidor." });
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
    res.status(500).json({ message: "Error interno del servidor." });
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
    res.status(500).json({ message: "Error interno del servidor." });
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
    res.status(500).json({ message: "Error interno del servidor." });
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
  const { id } = req.params;
  const { admin_user_id } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const neighborhood = await client.query(
      "SELECT neighborhood_id FROM neighborhoods WHERE neighborhood_id = $1 FOR UPDATE",
      [id],
    );
    if (neighborhood.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Barrio no encontrado." });
    }

    if (admin_user_id != null) {
      const candidate = await client.query(
        "SELECT user_id FROM users WHERE user_id = $1 AND role_id = 2 FOR UPDATE",
        [admin_user_id],
      );
      if (candidate.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          message: "Usuario no encontrado o no tiene rol Admin Barrio.",
        });
      }
    }

    const previous = await client.query(
      `SELECT user_id
       FROM users
       WHERE role_id = 2 AND neighborhood_id = $1
       FOR UPDATE`,
      [id],
    );

    await client.query(
      `UPDATE users
       SET neighborhood_id = NULL
       WHERE role_id = 2 AND neighborhood_id = $1`,
      [id],
    );

    if (admin_user_id != null) {
      await client.query(
        "UPDATE users SET neighborhood_id = $1 WHERE user_id = $2",
        [id, admin_user_id],
      );
    }

    await client.query("COMMIT");

    const io = req.app?.get?.("io");
    const affectedIds = new Set([
      ...previous.rows.map((row) => row.user_id),
      ...(admin_user_id == null ? [] : [admin_user_id]),
    ]);
    for (const userId of affectedIds) {
      io?.in(`user_${userId}`).disconnectSockets(true);
    }

    res.json({ message: "Representante actualizado correctamente." });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error actualizando representante:", err);
    res.status(500).json({ message: "No se pudo actualizar el representante." });
  } finally {
    client.release();
  }
};