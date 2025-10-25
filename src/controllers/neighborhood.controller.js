import { pool } from "../config/db.js";

export const getNeighborhoods = async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM neighborhoods ORDER BY name ASC");
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

export const getNeighborhoodById = async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM neighborhoods WHERE neighborhood_id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Barrio no encontrado" });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

export const createNeighborhood = async (req, res) => {
  try {
    const { name, description } = req.body;
    const query = `INSERT INTO neighborhoods (name, description, created_at)
                   VALUES ($1, $2, NOW()) RETURNING *`;
    const result = await pool.query(query, [name, description]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

export const updateNeighborhood = async (req, res) => {
  try {
    const { name, description } = req.body;
    const query = `UPDATE neighborhoods SET name=$1, description=$2 WHERE neighborhood_id=$3 RETURNING *`;
    const result = await pool.query(query, [name, description, req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Barrio no encontrado" });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

export const deleteNeighborhood = async (req, res) => {
  try {
    await pool.query("DELETE FROM neighborhoods WHERE neighborhood_id=$1", [req.params.id]);
    res.json({ message: "Barrio eliminado correctamente" });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
