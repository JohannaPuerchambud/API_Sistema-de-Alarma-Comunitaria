import { pool } from "../config/db.js";

const isMissingPushTokenTable = (error) => error?.code === "42P01";

export const getNeighborhoodPushRecipients = async (
  neighborhoodId,
  excludeUserId,
) => {
  try {
    return await pool.query(
      `SELECT u.user_id, pt.fcm_token
       FROM user_push_tokens pt
       INNER JOIN users u ON u.user_id = pt.user_id
       WHERE u.neighborhood_id = $1
         AND ($2::int IS NULL OR u.user_id != $2)`,
      [neighborhoodId, excludeUserId ?? null],
    );
  } catch (error) {
    if (!isMissingPushTokenTable(error)) throw error;

    console.warn(
      "user_push_tokens no existe; se usa users.fcm_token como compatibilidad.",
    );
    return pool.query(
      `SELECT user_id, fcm_token
       FROM users
       WHERE neighborhood_id = $1
         AND ($2::int IS NULL OR user_id != $2)
         AND fcm_token IS NOT NULL
         AND btrim(fcm_token) <> ''`,
      [neighborhoodId, excludeUserId ?? null],
    );
  }
};

export const savePushToken = async (userId, fcmToken) => {
  try {
    await pool.query(
      `INSERT INTO user_push_tokens
         (fcm_token, user_id, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (fcm_token)
       DO UPDATE SET user_id = EXCLUDED.user_id, updated_at = NOW()`,
      [fcmToken, userId],
    );
  } catch (error) {
    if (!isMissingPushTokenTable(error)) throw error;
    await pool.query(
      "UPDATE users SET fcm_token = $1 WHERE user_id = $2",
      [fcmToken, userId],
    );
  }
};

export const deletePushToken = async (userId, fcmToken) => {
  try {
    await pool.query(
      "DELETE FROM user_push_tokens WHERE user_id = $1 AND fcm_token = $2",
      [userId, fcmToken],
    );
  } catch (error) {
    if (!isMissingPushTokenTable(error)) throw error;
    await pool.query(
      `UPDATE users
       SET fcm_token = NULL
       WHERE user_id = $1 AND fcm_token = $2`,
      [userId, fcmToken],
    );
  }
};

export const deleteInvalidPushTokens = async (tokens) => {
  if (!tokens || tokens.length === 0) return;

  try {
    await pool.query(
      "DELETE FROM user_push_tokens WHERE fcm_token = ANY($1::text[])",
      [tokens],
    );
  } catch (error) {
    if (!isMissingPushTokenTable(error)) throw error;
    await pool.query(
      "UPDATE users SET fcm_token = NULL WHERE fcm_token = ANY($1::text[])",
      [tokens],
    );
  }
};