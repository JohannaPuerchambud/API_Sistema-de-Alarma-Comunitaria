import bcrypt from "bcryptjs";
import { pool } from "../config/db.js";

// ======================
// 🟦 Listar usuarios
// ======================
export const getUsers = async (req, res) => {
  try {
    const user = req.user;
    let query, values;

    if (user.role === 1) {
      // 🧠 Admin general: ve todos los usuarios
      query = `
        SELECT 
          u.user_id,
          u.name,
          u.email,
          u.address,
          u.role_id,
          u.neighborhood_id,
          n.name AS neighborhood_name,
          u.created_at
        FROM users u
        LEFT JOIN neighborhoods n ON u.neighborhood_id = n.neighborhood_id
        ORDER BY u.name ASC;
      `;
      values = [];
    } else {
      // 🏘️ Admin de barrio: ve solo su propio barrio
      query = `
        SELECT 
          u.user_id,
          u.name,
          u.email,
          u.address,
          u.role_id,
          u.neighborhood_id,
          n.name AS neighborhood_name,
          u.created_at
        FROM users u
        LEFT JOIN neighborhoods n ON u.neighborhood_id = n.neighborhood_id
        WHERE u.neighborhood_id = $1
        ORDER BY u.name ASC;
      `;
      values = [user.neighborhood];
    }

    const result = await pool.query(query, values);
    res.json(result.rows);

  } catch (err) {
    console.error("Error al obtener usuarios:", err);
    res.status(500).json({ error: err.message });
  }
};

// ======================
// 🟦 Obtener usuario por ID
// ======================
export const getUserById = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         u.*, 
         n.name AS neighborhood_name 
       FROM users u 
       LEFT JOIN neighborhoods n ON u.neighborhood_id = n.neighborhood_id 
       WHERE u.user_id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ message: "Usuario no encontrado" });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ======================
// 🟦 Crear usuario
// ======================
export const createUser = async (req, res) => {
  try {
    const { name, email, password, address, role_id, neighborhood_id } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    const query = `
      INSERT INTO users (name, email, password_hash, address, role_id, neighborhood_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *;
    `;

    const result = await pool.query(query, [
      name,
      email,
      hashedPassword,
      address,
      role_id,
      neighborhood_id,
    ]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ======================
// 🟦 Actualizar usuario
// ======================
export const updateUser = async (req, res) => {
  try {
    const { name, address, role_id, neighborhood_id } = req.body;

    const query = `
      UPDATE users
      SET name=$1, address=$2, role_id=$3, neighborhood_id=$4
      WHERE user_id=$5
      RETURNING *;
    `;

    const result = await pool.query(query, [
      name,
      address,
      role_id,
      neighborhood_id,
      req.params.id,
    ]);

    if (result.rows.length === 0)
      return res.status(404).json({ message: "Usuario no encontrado" });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ======================
// 🟦 Eliminar usuario
// ======================
export const deleteUser = async (req, res) => {
  try {
    await pool.query("DELETE FROM users WHERE user_id=$1", [req.params.id]);
    res.json({ message: "Usuario eliminado correctamente" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
