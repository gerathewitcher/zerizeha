-- +goose Up
INSERT INTO space_members (space_id, user_id)
SELECT s.id, s.author_id
FROM spaces s
WHERE NOT EXISTS (
  SELECT 1
  FROM space_members sm
  WHERE sm.space_id = s.id AND sm.user_id = s.author_id
);

-- +goose Down
-- No-op: backfill migration.
