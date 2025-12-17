import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../config/db.js";
import dotenv from "dotenv";
dotenv.config();

// ✅ Política de contraseña (mínimo 8, letras y números)
const isStrongPassword = (pwd) => /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(pwd || "");

export const register = async (req, res) => {
  try {
    const { name, email, password, role_id, neighborhood_id } = req.body;

    // ✅ Validaciones básicas
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Faltan campos obligatorios (name, email, password)." });
    }

    // ✅ Validación de contraseña
    if (!isStrongPassword(password)) {
      return res.status(400).json({
        message: "Contraseña débil: mínimo 8 caracteres e incluir letras y números."
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const query = `
      INSERT INTO users (name, email, password_hash, role_id, neighborhood_id, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING user_id, name, email, role_id;
    `;

    const result = await pool.query(query, [
      name,
      email,
      hashedPassword,
      role_id ?? 3,
      neighborhood_id ?? null
    ]);

    res.status(201).json({ message: "Usuario registrado correctamente", user: result.rows[0] });
  } catch (error) {
    // ✅ Manejo típico de email duplicado (unique constraint)
    if (error.code === "23505") {
      return res.status(409).json({ message: "El email ya está registrado." });
    }
    res.status(500).json({ error: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // ✅ Validaciones básicas
    if (!email || !password) {
      return res.status(400).json({ message: "Email y contraseña son obligatorios." });
    }

    // ✅ (Opcional) Validar formato mínimo también en login
    // Esto no da seguridad extra real (porque el hash manda), pero evita intentos basura.
    if (!isStrongPassword(password)) {
      return res.status(400).json({
        message: "Formato de contraseña inválido."
      });
    }

    const result = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ message: "Contraseña incorrecta" });
    }

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
        role: user.role_id
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
