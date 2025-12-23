import { pool } from "../config/db.js";

// Listar barrios
export const getNeighborhoods = async (req, res) => {
  try {
    const { role, neighborhood } = req.user || {};
    let query;
    let values = [];

    if (role === 1) {
      query = `
        SELECT neighborhood_id, name, description, boundary, created_at
        FROM neighborhoods
        ORDER BY name ASC
      `;
    } else if (role === 2) {
      query = `
        SELECT neighborhood_id, name, description, boundary, created_at
        FROM neighborhoods
        WHERE neighborhood_id = $1
        ORDER BY name ASC
      `;
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
    const result = await pool.query(
      "SELECT * FROM neighborhoods WHERE neighborhood_id = $1",
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Barrio no encontrado" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const createNeighborhood = async (req, res) => {
  try {
    const { name, description } = req.body;
    const query = `
      INSERT INTO neighborhoods (name, description, created_at)
      VALUES ($1, $2, NOW())
      RETURNING *`;
    const result = await pool.query(query, [name, description]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateNeighborhood = async (req, res) => {
  try {
    const { name, description, boundary = null } = req.body;
    const { id } = req.params;

    const query = `
      UPDATE neighborhoods
      SET name = $1,
          description = $2,
          boundary = $3
      WHERE neighborhood_id = $4
      RETURNING *`;

    const result = await pool.query(query, [name, description, boundary, id]);

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
      [req.params.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ message: "Barrio no encontrado" });
    }

    await pool.query(
      "DELETE FROM neighborhoods WHERE neighborhood_id = $1",
      [req.params.id]
    );
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
