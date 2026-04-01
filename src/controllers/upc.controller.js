import { pool } from "../config/db.js";

export const getUpcs = async (req, res) => {
  try {
    const query = `SELECT * FROM upcs ORDER BY name ASC`;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getUpcById = async (req, res) => {
  try {
    const { id } = req.params;
    const query = `SELECT * FROM upcs WHERE upc_id = $1`;
    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: "UPC no encontrada" });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const createUpc = async (req, res) => {
  try {
    const { name, description, address, phone, coverage_polygon } = req.body;

    const query = `
      INSERT INTO upcs (name, description, address, phone, coverage_polygon, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *`;

    const { rows } = await pool.query(query, [
      name,
      description,
      address,
      phone,
      coverage_polygon || null,
    ]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateUpc = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, address, phone, coverage_polygon } = req.body;

    const query = `
      UPDATE upcs
      SET name = $1, description = $2, address = $3, phone = $4, coverage_polygon = $5
      WHERE upc_id = $6
      RETURNING *`;

    const { rows } = await pool.query(query, [
      name,
      description,
      address,
      phone,
      coverage_polygon || null,
      id,
    ]);

    if (rows.length === 0) {
      return res.status(404).json({ message: "UPC no encontrada" });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteUpc = async (req, res) => {
  try {
    const { id } = req.params;

    const check = await pool.query("SELECT 1 FROM upcs WHERE upc_id = $1", [
      id,
    ]);
    if (check.rows.length === 0) {
      return res.status(404).json({ message: "UPC no encontrada" });
    }

    await pool.query("DELETE FROM upcs WHERE upc_id = $1", [id]);
    res.json({ message: "UPC eliminada correctamente" });
  } catch (err) {
    if (err.code === "23503") {
      return res.status(400).json({
        error:
          "No se puede eliminar la UPC porque hay barrios vinculados a ella.",
      });
    }
    res.status(500).json({ error: err.message });
  }
};
