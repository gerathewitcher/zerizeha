-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS channel_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT channel_messages_body_not_empty_chk CHECK (length(btrim(body)) > 0)
);

CREATE INDEX IF NOT EXISTS channel_messages_channel_id_created_at_idx
  ON channel_messages (channel_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS channel_messages_created_at_idx
  ON channel_messages (created_at);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS channel_messages;
-- +goose StatementEnd
