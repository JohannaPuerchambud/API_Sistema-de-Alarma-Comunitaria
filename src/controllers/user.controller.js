import bcrypt from "bcryptjs";
import { pool } from "../config/db.js";

const sameNeighborhood = (a, b) => Number(a) === Number(b);

// Listar
export const getUsers = async (req, res) => {
  try {
    const { role, neighborhood } = req.user;
    let query, values = [];

    if (role === 1) {
      query = `
        SELECT u.user_id, u.name, u.email, u.role_id, u.neighborhood_id, n.name AS neighborhood_name
        FROM users u LEFT JOIN neighborhoods n ON n.neighborhood_id = u.neighborhood_id
        ORDER BY u.user_id DESC`;
    } else if (role === 2) {
      query = `
        SELECT u.user_id, u.name, u.email, u.role_id, u.neighborhood_id, n.name AS neighborhood_name
        FROM users u LEFT JOIN neighborhoods n ON n.neighborhood_id = u.neighborhood_id
        WHERE u.neighborhood_id = $1
        ORDER BY u.user_id DESC`;
      values = [neighborhood];
    } else {
      return res.status(403).json({ message: "No autorizado" });
    }

    const { rows } = await pool.query(query, values);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// Obtener por id
export const getUserById = async (req, res) => {
  try {
    const { role, neighborhood } = req.user;
    const { id } = req.params;

    const q = await pool.query(`SELECT user_id, name, email, role_id, neighborhood_id FROM users WHERE user_id=$1`, [id]);
    if (q.rows.length === 0) return res.status(404).json({ message: "No encontrado" });

    const target = q.rows[0];
    if (role === 2 && !sameNeighborhood(neighborhood, target.neighborhood_id)) {
      return res.status(403).json({ message: "No autorizado" });
    }
    res.json(target);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// Crear
export const createUser = async (req, res) => {
  try {
    const { role, neighborhood } = req.user;
    const { name, email, password, role_id, neighborhood_id, address } = req.body;

    if (role === 2 && !sameNeighborhood(neighborhood, neighborhood_id)) {
      return res.status(403).json({ message: "Solo puedes crear usuarios de tu barrio" });
    }

    // (opcional) impedir que role=2 cree Admin General
    if (role === 2 && role_id === 1) {
      return res.status(403).json({ message: "No puedes crear Admin General" });
    }

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role_id, neighborhood_id, address, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       RETURNING user_id, name, email, role_id, neighborhood_id`,
      [name, email, hash, role_id, neighborhood_id ?? null, address ?? null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// Actualizar
export const updateUser = async (req, res) => {
  try {
    const { role, neighborhood } = req.user;
    const { id } = req.params;
    const { name, email, password, role_id, neighborhood_id, address } = req.body;

    const found = await pool.query(`SELECT neighborhood_id FROM users WHERE user_id=$1`, [id]);
    if (found.rows.length === 0) return res.status(404).json({ message: "No encontrado" });

    if (role === 2 && !sameNeighborhood(neighborhood, found.rows[0].neighborhood_id)) {
      return res.status(403).json({ message: "No autorizado" });
    }
    if (role === 2 && neighborhood_id && !sameNeighborhood(neighborhood, neighborhood_id)) {
      return res.status(403).json({ message: "No puedes cambiar el usuario a otro barrio" });
    }
    if (role === 2 && role_id === 1) {
      return res.status(403).json({ message: "No puedes ascender a Admin General" });
    }

    const sets = ["name=$1","email=$2","role_id=$3","neighborhood_id=$4","address=$5"];
    let vals = [name, email, role_id, neighborhood_id ?? null, address ?? null, id];
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      sets.push("password_hash=$6");
      vals = [name, email, role_id, neighborhood_id ?? null, address ?? null, hash, id];
    }

    const { rows } = await pool.query(
      `UPDATE users SET ${sets.join(", ")} WHERE user_id=$${vals.length} RETURNING user_id, name, email, role_id, neighborhood_id`,
      vals
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// Eliminar
export const deleteUser = async (req, res) => {
  try {
    const { role, neighborhood } = req.user;
    const { id } = req.params;

    if (role === 2) {
      const q = await pool.query(`SELECT neighborhood_id FROM users WHERE user_id=$1`, [id]);
      if (q.rows.length === 0) return res.status(404).json({ message: "No encontrado" });
      if (!sameNeighborhood(neighborhood, q.rows[0].neighborhood_id)) {
        return res.status(403).json({ message: "No autorizado" });
      }
    }

    await pool.query("DELETE FROM users WHERE user_id=$1", [id]);
    res.json({ message: "Usuario eliminado correctamente" });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
