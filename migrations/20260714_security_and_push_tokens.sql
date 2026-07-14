BEGIN;

CREATE TABLE IF NOT EXISTS emergency_cooldowns (
  user_id integer NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  neighborhood_id integer NOT NULL REFERENCES neighborhoods(neighborhood_id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, neighborhood_id)
);

CREATE INDEX IF NOT EXISTS emergency_cooldowns_expires_at_idx
  ON emergency_cooldowns (expires_at);

CREATE TABLE IF NOT EXISTS user_push_tokens (
  fcm_token text PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_push_tokens_user_id_idx
  ON user_push_tokens (user_id);

INSERT INTO user_push_tokens (fcm_token, user_id)
SELECT fcm_token, user_id
FROM users
WHERE fcm_token IS NOT NULL
  AND btrim(fcm_token) <> ''
ON CONFLICT (fcm_token) DO UPDATE
SET user_id = EXCLUDED.user_id,
    updated_at = NOW();

COMMIT;