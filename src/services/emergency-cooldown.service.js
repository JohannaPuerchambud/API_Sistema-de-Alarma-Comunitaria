import { pool } from "../config/db.js";

const localCooldowns = new Map();

const getCooldownSeconds = () => {
  const configured = Number(process.env.EMERGENCY_COOLDOWN_SECONDS ?? 60);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : 60;
};

const getKey = (userId, neighborhoodId) => `${userId}:${neighborhoodId}`;

export const claimEmergencyCooldown = async (userId, neighborhoodId) => {
  const cooldownSeconds = getCooldownSeconds();
  const key = getKey(userId, neighborhoodId);
  const now = Date.now();
  const localExpiresAt = localCooldowns.get(key) ?? 0;

  if (localExpiresAt > now) {
    return Math.ceil((localExpiresAt - now) / 1000);
  }

  const { rows } = await pool.query(
    `
    SELECT GREATEST(
             1,
             CEIL(
               EXTRACT(
                 EPOCH FROM (
                   created_at + ($3 * INTERVAL '1 second') - NOW()
                 )
               )
             )
           )::int AS retry_after_seconds
    FROM chat_messages
    WHERE user_id = $1
      AND neighborhood_id = $2
      AND message LIKE '%EMERGENCIA ACTIVADA%'
      AND created_at > NOW() - ($3 * INTERVAL '1 second')
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [userId, neighborhoodId, cooldownSeconds],
  );

  if (rows.length > 0) {
    const retryAfter = Number(rows[0].retry_after_seconds) || cooldownSeconds;
    localCooldowns.set(key, now + retryAfter * 1000);
    return retryAfter;
  }

  localCooldowns.set(key, now + cooldownSeconds * 1000);
  return 0;
};

export const releaseEmergencyCooldown = (userId, neighborhoodId) => {
  localCooldowns.delete(getKey(userId, neighborhoodId));
};
