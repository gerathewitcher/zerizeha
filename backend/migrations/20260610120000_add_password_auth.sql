-- +goose Up
CREATE TABLE IF NOT EXISTS user_passwords (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_email_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  purpose text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS auth_email_tokens_hash_uidx ON auth_email_tokens (token_hash);
CREATE INDEX IF NOT EXISTS auth_email_tokens_user_purpose_idx ON auth_email_tokens (user_id, purpose);

-- +goose Down
DROP TABLE IF EXISTS auth_email_tokens;
DROP TABLE IF EXISTS user_passwords;
