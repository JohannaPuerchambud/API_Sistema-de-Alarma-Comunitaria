import { pool } from "../config/db.js";

export const getCurrentUser = async (userId) => {
  if (!userId) return null;

  const { rows } = await pool.query(
    `
    SELECT u.user_id,
           u.name,
           u.last_name,
           u.email,
           u.phone,
           u.address,
           u.role_id,
           u.neighborhood_id,
           n.name AS neighborhood_name
    FROM users u
    LEFT JOIN neighborhoods n ON n.neighborhood_id = u.neighborhood_id
    WHERE u.user_id = $1
    `,
    [userId],
  );

  if (rows.length === 0) return null;

  const user = rows[0];
  return {
    id: Number(user.user_id),
    name: user.name,
    last_name: user.last_name,
    role: Number(user.role_id),
    neighborhood:
      user.neighborhood_id == null ? null : Number(user.neighborhood_id),
    neighborhood_name: user.neighborhood_name,
    email: user.email,
    phone: user.phone,
    address: user.address,
  };
};
