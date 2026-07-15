import { pool } from "../config/db.js";

const memoryCooldowns = new Map();

const getCooldownSeconds = () => {
  const configured = Number(process.env.EMERGENCY_COOLDOWN_SECONDS ?? 60);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : 60;
};

const cooldownKey = (userId, neighborhoodId) =>
  `${userId}:${neighborhoodId}`;

const claimMemoryCooldown = (userId, neighborhoodId, cooldownSeconds) => {
  const key = cooldownKey(userId, neighborhoodId);
  const now = Date.now();
  const currentExpiration = memoryCooldowns.get(key) || 0;

  if (currentExpiration > now) {
    return Math.max(1, Math.ceil((currentExpiration - now) / 1000));
  }

  memoryCooldowns.set(key, now + cooldownSeconds * 1000);
  return 0;
};

export const claimEmergencyCooldown = async (userId, neighborhoodId) => {
  const cooldownSeconds = getCooldownSeconds();

  try {
    const claim = await pool.query(
      `
      INSERT INTO emergency_cooldowns
        (user_id, neighborhood_id, expires_at)
      VALUES
        ($1, $2, NOW() + ($3 * INTERVAL '1 second'))
      ON CONFLICT (user_id, neighborhood_id)
      DO UPDATE
        SET expires_at = EXCLUDED.expires_at
        WHERE emergency_cooldowns.expires_at <= NOW()
      RETURNING expires_at
      `,
      [userId, neighborhoodId, cooldownSeconds],
    );

    if (claim.rows.length > 0) return 0;

    const { rows } = await pool.query(
      `
      SELECT GREATEST(
               1,
               CEIL(EXTRACT(EPOCH FROM (expires_at - NOW())))
             )::int AS retry_after_seconds
      FROM emergency_cooldowns
      WHERE user_id = $1
        AND neighborhood_id = $2
      `,
      [userId, neighborhoodId],
    );

    return Number(rows[0]?.retry_after_seconds) || cooldownSeconds;
  } catch (error) {
    if (error?.code !== "42P01") throw error;

    console.warn(
      "emergency_cooldowns no existe; se usa cooldown temporal en memoria.",
    );
    return claimMemoryCooldown(userId, neighborhoodId, cooldownSeconds);
  }
};

export const releaseEmergencyCooldown = async (userId, neighborhoodId) => {
  if (userId == null || neighborhoodId == null) return;

  memoryCooldowns.delete(cooldownKey(userId, neighborhoodId));

  try {
    await pool.query(
      `
      DELETE FROM emergency_cooldowns
      WHERE user_id = $1
        AND neighborhood_id = $2
      `,
      [userId, neighborhoodId],
    );
  } catch (error) {
    if (error?.code !== "42P01") throw error;
  }
};