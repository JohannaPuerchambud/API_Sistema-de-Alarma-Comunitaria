import bcrypt from "bcryptjs";
import { pool } from "../config/db.js";

export const getUsers = async (req, res) => {
  try {
    const user = req.user;
    let query, values;

    // admin general ve todos; admin barrio ve solo su barrio
    if (user.role === 1) { // 1 = ADMIN_GENERAL
      query = "SELECT * FROM users ORDER BY name ASC";
      values = [];
    } else {
      query = "SELECT * FROM users WHERE neighborhood_id = $1 ORDER BY name ASC";
      values = [user.neighborhood];
    }

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

export const getUserById = async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users WHERE user_id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

export const createUser = async (req, res) => {
  try {
    const { name, email, password, address, role_id, neighborhood_id } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    const query = `
      INSERT INTO users (name, email, password_hash, address, role_id, neighborhood_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *;
    `;
    const result = await pool.query(query, [name, email, hashedPassword, address, role_id, neighborhood_id]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

export const updateUser = async (req, res) => {
  try {
    const { name, address, role_id } = req.body;
    const query = `UPDATE users SET name=$1, address=$2, role_id=$3 WHERE user_id=$4 RETURNING *`;
    const result = await pool.query(query, [name, address, role_id, req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

export const deleteUser = async (req, res) => {
  try {
    await pool.query("DELETE FROM users WHERE user_id=$1", [req.params.id]);
    res.json({ message: "Usuario eliminado correctamente" });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
