import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../config/db.js";
import dotenv from "dotenv";
dotenv.config();

export const register = async (req, res) => {
  try {
    const { name, email, password, role_id, neighborhood_id } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);
    const query = `
      INSERT INTO users (name, email, password_hash, role_id, neighborhood_id, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING user_id, name, email, role_id;
    `;
    const result = await pool.query(query, [name, email, hashedPassword, role_id, neighborhood_id]);
    res.status(201).json({ message: "Usuario registrado correctamente", user: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);

    if (result.rows.length === 0)
      return res.status(404).json({ message: "Usuario no encontrado" });

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword)
      return res.status(401).json({ message: "Contraseña incorrecta" });

    const token = jwt.sign(
      {
        id: user.user_id,
        name: user.name, 
        role: user.role_id,
        neighborhood: user.neighborhood_id
      },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.status(200).json({
      message: "Login exitoso",
      token,
      user: {
        id: user.user_id,
        name: user.name,
        role: user.role_id,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
