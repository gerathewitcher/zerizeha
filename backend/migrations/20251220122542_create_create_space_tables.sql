-- +goose Up
-- +goose StatementBegin
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  author_id uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS spaces_author_id_idx ON spaces (author_id);

CREATE TABLE IF NOT EXISTS channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
  name text NOT NULL,
  channel_type text NOT NULL,
  author_id uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  CONSTRAINT channels_channel_type_chk CHECK (channel_type IN ('text', 'voice')),
  CONSTRAINT channels_space_id_name_uidx UNIQUE (space_id, name)
);

CREATE INDEX IF NOT EXISTS channels_space_id_idx ON channels (space_id);
CREATE INDEX IF NOT EXISTS channels_author_id_idx ON channels (author_id);

CREATE TABLE IF NOT EXISTS space_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT space_members_space_id_user_id_uidx UNIQUE (space_id, user_id)
);

CREATE INDEX IF NOT EXISTS space_members_space_id_idx ON space_members (space_id);
CREATE INDEX IF NOT EXISTS space_members_user_id_idx ON space_members (user_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS space_members;
DROP TABLE IF EXISTS channels;
DROP TABLE IF EXISTS spaces;
-- +goose StatementEnd
