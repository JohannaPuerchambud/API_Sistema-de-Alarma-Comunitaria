import bcrypt from "bcryptjs";
import { pool } from "../config/db.js";

const sameNeighborhood = (a, b) => Number(a) === Number(b);

const isStrongPassword = (pwd) =>
  /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(pwd || "");

// Listar
export const getUsers = async (req, res) => {
  try {
    const { role, neighborhood } = req.user;
    let query,
      values = [];

    if (role === 1) {
      query = `
      SELECT u.user_id,
             u.name,
             u.last_name,
             u.email,
             u.phone,
             u.address,
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
             u.address,
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
    res.status(500).json({ message: "Error interno del servidor." });
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
      [id],
    );

    if (q.rows.length === 0)
      return res.status(404).json({ message: "No encontrado" });

    const target = q.rows[0];
    if (role === 2 && !sameNeighborhood(neighborhood, target.neighborhood_id)) {
      return res.status(403).json({ message: "No autorizado" });
    }
    res.json(target);
  } catch (err) {
    res.status(500).json({ message: "Error interno del servidor." });
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
      home_lng,
    } = req.body;

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({
          message: "Faltan campos obligatorios (name, email, password).",
        });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        message:
          "Contraseña débil: mínimo 8 caracteres e incluir letras y números.",
      });
    }

    if (role === 2 && !neighborhood) {
      return res.status(400).json({
        message: "Tu cuenta de representante no tiene un barrio asignado.",
      });
    }

    if (role === 2 && role_id != null && Number(role_id) !== 3) {
      return res.status(403).json({
        message: "Solo el Admin General puede crear administradores.",
      });
    }

    const effectiveRoleId = role === 2 ? 3 : (role_id ?? 3);
    const effectiveNeighborhoodId =
      role === 2 ? neighborhood : (neighborhood_id ?? null);

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
        effectiveRoleId,
        effectiveNeighborhoodId,
        address ?? null,
        phone ?? null,
        home_lat ?? null,
        home_lng ?? null,
      ],
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ message: "El email ya está registrado." });
    }
    res.status(500).json({ message: "Error interno del servidor." });
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
      home_lng,
    } = req.body;

    const found = await pool.query(
      `SELECT neighborhood_id, role_id FROM users WHERE user_id=$1`,
      [id],
    );

    if (found.rows.length === 0)
      return res.status(404).json({ message: "No encontrado" });

    if (
      role === 2 &&
      !sameNeighborhood(neighborhood, found.rows[0].neighborhood_id)
    ) {
      return res.status(403).json({ message: "No autorizado" });
    }

    if (role === 2 && Number(found.rows[0].role_id) !== 3) {
      return res.status(403).json({
        message: "Solo el Admin General puede modificar administradores",
      });
    }

    if (role === 2 && !neighborhood) {
      return res.status(400).json({
        message: "Tu cuenta de representante no tiene un barrio asignado.",
      });
    }

    const effectiveRoleId = role === 2 ? 3 : role_id;
    const effectiveNeighborhoodId =
      role === 2 ? neighborhood : (neighborhood_id ?? null);

    if (password && !isStrongPassword(password)) {
      return res.status(400).json({
        message:
          "Contraseña débil: mínimo 8 caracteres e incluir letras y números.",
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
      "home_lng = $9",
    ];

    let vals = [
      name,
      last_name ?? null,
      email,
      effectiveRoleId,
      effectiveNeighborhoodId,
      address ?? null,
      phone ?? null,
      home_lat ?? null,
      home_lng ?? null,
      id,
    ];

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      sets.push("password_hash = $10");
      vals = [
        name,
        last_name ?? null,
        email,
        effectiveRoleId,
        effectiveNeighborhoodId,
        address ?? null,
        phone ?? null,
        home_lat ?? null,
        home_lng ?? null,
        hash,
        id,
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
      vals,
    );

    req.app?.get?.("io")?.in(`user_${id}`).disconnectSockets(true);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ message: "El email ya está registrado." });
    }
    res.status(500).json({ message: "Error interno del servidor." });
  }
};

// Eliminar
export const deleteUser = async (req, res) => {
  try {
    const { role, neighborhood } = req.user;
    const { id } = req.params;

    if (role === 2) {
      const q = await pool.query(
        `SELECT neighborhood_id, role_id FROM users WHERE user_id=$1`,
        [id],
      );
      if (q.rows.length === 0)
        return res.status(404).json({ message: "No encontrado" });
      if (!sameNeighborhood(neighborhood, q.rows[0].neighborhood_id)) {
        return res.status(403).json({ message: "No autorizado" });
      }
      if (Number(q.rows[0].role_id) !== 3) {
        return res.status(403).json({
          message: "Solo el Admin General puede eliminar administradores",
        });
      }
    }

    await pool.query("DELETE FROM users WHERE user_id=$1", [id]);
    req.app?.get?.("io")?.in(`user_${id}`).disconnectSockets(true);
    res.json({ message: "Usuario eliminado correctamente" });
  } catch (err) {
    res.status(500).json({ message: "Error interno del servidor." });
  }
};

// Guardar FCM Token
export const saveFcmToken = async (req, res) => {
  try {
    const { id } = req.user;
    const fcmToken = String(req.body.fcm_token || "").trim();

    if (!fcmToken || fcmToken.length > 4096) {
      return res.status(400).json({ message: "Token FCM inválido." });
    }

    await pool.query(
      `INSERT INTO user_push_tokens (fcm_token, user_id, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (fcm_token)
       DO UPDATE SET user_id = EXCLUDED.user_id, updated_at = NOW()`,
      [fcmToken, id],
    );

    res.json({ message: "Token FCM actualizado correctamente" });
  } catch (err) {
    console.error("Error guardando token FCM:", err);
    res.status(500).json({ message: "No se pudo guardar el token FCM." });
  }
};

export const deleteFcmToken = async (req, res) => {
  try {
    const { id } = req.user;
    const fcmToken = String(req.body.fcm_token || "").trim();

    if (!fcmToken || fcmToken.length > 4096) {
      return res.status(400).json({ message: "Token FCM inválido." });
    }

    await pool.query(
      "DELETE FROM user_push_tokens WHERE user_id = $1 AND fcm_token = $2",
      [id, fcmToken],
    );

    res.json({ message: "Token FCM eliminado correctamente" });
  } catch (err) {
    console.error("Error eliminando token FCM:", err);
    res.status(500).json({ message: "No se pudo eliminar el token FCM." });
  }
};
/**
 * GET /api/users/admins
 * Devuelve todos los usuarios con role_id = 2 (Admins de Barrio)
 * con el nombre del barrio que administran actualmente (si tienen uno).
 * Usado en el selector de representante del CRUD de barrios.
 */
export const getAdmins = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        u.user_id,
        u.name,
        u.last_name,
        u.email,
        u.phone,
        u.neighborhood_id,
        n.name AS neighborhood_name
      FROM users u
      LEFT JOIN neighborhoods n ON n.neighborhood_id = u.neighborhood_id
      WHERE u.role_id = 2
      ORDER BY u.name ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Error interno del servidor." });
  }
};
