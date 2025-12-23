-- +goose Up
-- +goose StatementBegin
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES users (id),
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS users_confirmed_idx ON users (confirmed);
CREATE INDEX IF NOT EXISTS users_is_admin_idx ON users (is_admin);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS users_is_admin_idx;
DROP INDEX IF EXISTS users_confirmed_idx;

ALTER TABLE users
  DROP COLUMN IF EXISTS is_admin,
  DROP COLUMN IF EXISTS confirmed_by,
  DROP COLUMN IF EXISTS confirmed_at,
  DROP COLUMN IF EXISTS confirmed;
-- +goose StatementEnd
