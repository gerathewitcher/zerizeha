-- +goose Up
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_uidx ON users (username);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uidx ON users (email);

-- +goose Down
DROP TABLE IF EXISTS users;

