package pg_chat_repo

import (
	"context"
	"time"

	sq "github.com/Masterminds/squirrel"

	"zerizeha/internal/dto"
	"zerizeha/internal/repository"
	"zerizeha/pkg/db"
)

type repo struct {
	db db.Client
}

// NewPostgresChatRepo creates a Postgres-backed chat repository.
func NewPostgresChatRepo(db db.Client) repository.ChatRepository {
	return &repo{
		db: db,
	}
}

func (r *repo) CreateChannelMessage(message dto.ChannelMessageToCreate) (messageID string, err error) {
	queryBuilder := sq.Insert("channel_messages").
		Columns("channel_id", "author_id", "body").
		Values(message.ChannelID, message.AuthorID, message.Body).
		Suffix("RETURNING id").
		PlaceholderFormat(sq.Dollar)

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return "", err
	}

	query := db.Query{
		Name:     "chat.create_channel_message",
		QueryRaw: queryRaw,
	}

	row := r.db.DB().QueryRowContext(context.Background(), query, args...)
	if err := row.Scan(&messageID); err != nil {
		return "", err
	}

	return messageID, nil
}

func (r *repo) GetChannelMessageByID(id string) (dto.ChannelMessage, error) {
	queryBuilder := sq.Select(
		"cm.id",
		"cm.channel_id",
		"cm.author_id",
		"cm.body",
		"cm.created_at",
		"u.username",
		"u.is_admin",
	).
		From("channel_messages cm").
		Join("users u ON u.id = cm.author_id").
		Where(sq.Eq{"cm.id": id}).
		PlaceholderFormat(sq.Dollar)

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return dto.ChannelMessage{}, err
	}

	query := db.Query{
		Name:     "chat.get_channel_message_by_id",
		QueryRaw: queryRaw,
	}

	var message ChannelMessage
	row := r.db.DB().QueryRowContext(context.Background(), query, args...)
	if err := row.Scan(
		&message.id,
		&message.channelID,
		&message.authorID,
		&message.body,
		&message.createdAt,
		&message.authorUsername,
		&message.authorIsAdmin,
	); err != nil {
		return dto.ChannelMessage{}, err
	}

	return ToChannelMessageFromRepo(message), nil
}

func (r *repo) ListChannelMessages(channelID string, limit int, cursor *dto.ChannelMessageCursor) ([]dto.ChannelMessage, *dto.ChannelMessageCursor, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	queryBuilder := sq.Select("cm.id", "cm.channel_id", "cm.author_id", "cm.body", "cm.created_at").
		Columns("u.username", "u.is_admin").
		From("channel_messages cm").
		Join("users u ON u.id = cm.author_id").
		Where(sq.Eq{"cm.channel_id": channelID}).
		OrderBy("cm.created_at desc", "cm.id desc").
		Limit(uint64(limit + 1)).
		PlaceholderFormat(sq.Dollar)

	if cursor != nil && !cursor.CreatedAt.IsZero() && cursor.ID != "" {
		queryBuilder = queryBuilder.Where(
			sq.Or{
				sq.Lt{"cm.created_at": cursor.CreatedAt},
				sq.And{
					sq.Eq{"cm.created_at": cursor.CreatedAt},
					sq.Lt{"cm.id": cursor.ID},
				},
			},
		)
	}

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return nil, nil, err
	}

	query := db.Query{
		Name:     "chat.list_channel_messages",
		QueryRaw: queryRaw,
	}

	rows, err := r.db.DB().QueryContext(context.Background(), query, args...)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	result := make([]dto.ChannelMessage, 0, limit+1)
	for rows.Next() {
		var message ChannelMessage
		if err := rows.Scan(
			&message.id,
			&message.channelID,
			&message.authorID,
			&message.body,
			&message.createdAt,
			&message.authorUsername,
			&message.authorIsAdmin,
		); err != nil {
			return nil, nil, err
		}
		result = append(result, ToChannelMessageFromRepo(message))
	}

	var nextCursor *dto.ChannelMessageCursor
	if len(result) > limit {
		last := result[limit-1]
		nextCursor = &dto.ChannelMessageCursor{
			CreatedAt: last.CreatedAt,
			ID:        last.ID,
		}
		result = result[:limit]
	}

	return result, nextCursor, nil
}

func (r *repo) DeleteChannelMessagesBefore(createdBefore time.Time) ([]dto.ChannelMessageCleanupResult, error) {
	query := db.Query{
		Name: "chat.delete_channel_messages_before",
		QueryRaw: `
WITH deleted AS (
	DELETE FROM channel_messages
	WHERE created_at < $1
	RETURNING channel_id
)
SELECT channel_id, COUNT(*)::int AS deleted_count
FROM deleted
GROUP BY channel_id
ORDER BY channel_id
`,
	}

	rows, err := r.db.DB().QueryContext(context.Background(), query, createdBefore)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make([]dto.ChannelMessageCleanupResult, 0)
	for rows.Next() {
		var item dto.ChannelMessageCleanupResult
		item.DeletedBefore = createdBefore
		if err := rows.Scan(&item.ChannelID, &item.DeletedCount); err != nil {
			return nil, err
		}
		results = append(results, item)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return results, nil
}
