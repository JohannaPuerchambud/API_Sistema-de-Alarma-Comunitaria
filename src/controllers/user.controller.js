import bcrypt from "bcryptjs";
import { pool } from "../config/db.js";

const sameNeighborhood = (a, b) => Number(a) === Number(b);

// ✅ Política de contraseña (mínimo 8, letras y números)
const isStrongPassword = (pwd) => /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(pwd || "");

// Listar
export const getUsers = async (req, res) => {
  try {
    const { role, neighborhood } = req.user;
    let query, values = [];

    if (role === 1) {
      query = `
      SELECT u.user_id,
             u.name,
             u.last_name,
             u.email,
             u.phone,
             u.role_id,
             u.neighborhood_id,
             u.home_lat,
             u.home_lng,
             n.name AS neighborhood_name
      FROM users u
      LEFT JOIN neighborhoods n ON n.neighborhood_id = u.neighborhood_id
      ORDER BY u.user_id DESC`;
    } else if (role === 2) {
      query = `
      SELECT u.user_id,
             u.name,
             u.last_name,
             u.email,
             u.phone,
             u.role_id,
             u.neighborhood_id,
             u.home_lat,
             u.home_lng,
             n.name AS neighborhood_name
      FROM users u
      LEFT JOIN neighborhoods n ON n.neighborhood_id = u.neighborhood_id
      WHERE u.neighborhood_id = $1
      ORDER BY u.user_id DESC`;
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

// Obtener por id
export const getUserById = async (req, res) => {
  try {
    const { role, neighborhood } = req.user;
    const { id } = req.params;

    const q = await pool.query(
      `SELECT user_id,
              name,
              last_name,
              email,
              phone,
              role_id,
              neighborhood_id,
              address,
              home_lat,
              home_lng
       FROM users
       WHERE user_id = $1`,
      [id]
    );

    if (q.rows.length === 0) return res.status(404).json({ message: "No encontrado" });

    const target = q.rows[0];
    if (role === 2 && !sameNeighborhood(neighborhood, target.neighborhood_id)) {
      return res.status(403).json({ message: "No autorizado" });
    }
    res.json(target);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Crear
export const createUser = async (req, res) => {
  try {
    const { role, neighborhood } = req.user;
    const {
      name,
      last_name,
      email,
      password,
      role_id,
      neighborhood_id,
      address,
      phone,
      home_lat,
      home_lng
    } = req.body;

    // ✅ Campos mínimos
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Faltan campos obligatorios (name, email, password)." });
    }

    // ✅ Validación de contraseña (crear siempre requiere password)
    if (!isStrongPassword(password)) {
      return res.status(400).json({
        message: "Contraseña débil: mínimo 8 caracteres e incluir letras y números."
      });
    }

    if (role === 2 && !sameNeighborhood(neighborhood, neighborhood_id)) {
      return res.status(403).json({ message: "Solo puedes crear usuarios de tu barrio" });
    }

    // impedir que role=2 cree Admin General
    if (role === 2 && role_id === 1) {
      return res.status(403).json({ message: "No puedes crear Admin General" });
    }

    const hash = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      `INSERT INTO users
         (name, last_name, email, password_hash,
          role_id, neighborhood_id, address,
          phone, home_lat, home_lng, created_at)
       VALUES
         ($1,   $2,        $3,   $4,
          $5,   $6,         $7,
          $8,   $9,    $10, NOW())
       RETURNING user_id,
                 name,
                 last_name,
                 email,
                 phone,
                 role_id,
                 neighborhood_id,
                 home_lat,
                 home_lng`,
      [
        name,
        last_name ?? null,
        email,
        hash,
        role_id ?? 3,
        neighborhood_id ?? null,
        address ?? null,
        phone ?? null,
        home_lat ?? null,
        home_lng ?? null
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ message: "El email ya está registrado." });
    }
    res.status(500).json({ error: err.message });
  }
};

// Actualizar
export const updateUser = async (req, res) => {
  try {
    const { role, neighborhood } = req.user;
    const { id } = req.params;
    const {
      name,
      last_name,
      email,
      password,
      role_id,
      neighborhood_id,
      address,
      phone,
      home_lat,
      home_lng
    } = req.body;

    const found = await pool.query(
      `SELECT neighborhood_id FROM users WHERE user_id=$1`,
      [id]
    );

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

    // ✅ Si viene password, validar antes de hashear
    if (password && !isStrongPassword(password)) {
      return res.status(400).json({
        message: "Contraseña débil: mínimo 8 caracteres e incluir letras y números."
      });
    }

    const sets = [
      "name = $1",
      "last_name = $2",
      "email = $3",
      "role_id = $4",
      "neighborhood_id = $5",
      "address = $6",
      "phone = $7",
      "home_lat = $8",
      "home_lng = $9"
    ];

    let vals = [
      name,
      last_name ?? null,
      email,
      role_id,
      neighborhood_id ?? null,
      address ?? null,
      phone ?? null,
      home_lat ?? null,
      home_lng ?? null,
      id
    ];

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      sets.push("password_hash = $10");
      vals = [
        name,
        last_name ?? null,
        email,
        role_id,
        neighborhood_id ?? null,
        address ?? null,
        phone ?? null,
        home_lat ?? null,
        home_lng ?? null,
        hash,
        id
      ];
    }

    const { rows } = await pool.query(
      `
      UPDATE users
      SET ${sets.join(", ")}
      WHERE user_id = $${vals.length}
      RETURNING user_id,
                name,
                last_name,
                email,
                phone,
                role_id,
                neighborhood_id,
                home_lat,
                home_lng`,
      vals
    );

    res.json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ message: "El email ya está registrado." });
    }
    res.status(500).json({ error: err.message });
  }
};

// Eliminar
export const deleteUser = async (req, res) => {
  try {
    const { role, neighborhood } = req.user;
    const { id } = req.params;

    if (role === 2) {
      const q = await pool.query(
        `SELECT neighborhood_id FROM users WHERE user_id=$1`,
        [id]
      );
      if (q.rows.length === 0) return res.status(404).json({ message: "No encontrado" });
      if (!sameNeighborhood(neighborhood, q.rows[0].neighborhood_id)) {
        return res.status(403).json({ message: "No autorizado" });
      }
    }

    await pool.query("DELETE FROM users WHERE user_id=$1", [id]);
    res.json({ message: "Usuario eliminado correctamente" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
