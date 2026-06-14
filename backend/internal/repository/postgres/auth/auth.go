package pg_auth_repo

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

func NewPostgresAuthCredentialRepo(db db.Client) repository.AuthCredentialRepository {
	return &repo{db: db}
}

func (r *repo) UpsertPassword(userID string, passwordHash string) error {
	queryBuilder := sq.Insert("user_passwords").
		Columns("user_id", "password_hash").
		Values(userID, passwordHash).
		Suffix("ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = now()").
		PlaceholderFormat(sq.Dollar)

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return err
	}

	query := db.Query{
		Name:     "auth_password.upsert",
		QueryRaw: queryRaw,
	}
	_, err = r.db.DB().ExecContext(context.Background(), query, args...)
	return err
}

func (r *repo) GetPasswordHashByEmail(email string) (dto.User, string, error) {
	queryBuilder := sq.Select(
		"u.id",
		"u.username",
		"u.email",
		"u.confirmed",
		"u.confirmed_at",
		"u.confirmed_by",
		"u.is_admin",
		"u.created_at",
		"p.password_hash",
	).
		From("users u").
		Join("user_passwords p ON p.user_id = u.id").
		Where(sq.Eq{"u.email": email}).
		PlaceholderFormat(sq.Dollar)

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return dto.User{}, "", err
	}

	query := db.Query{
		Name:     "auth_password.get_by_email",
		QueryRaw: queryRaw,
	}

	var user dto.User
	var passwordHash string
	row := r.db.DB().QueryRowContext(context.Background(), query, args...)
	if err := row.Scan(
		&user.ID,
		&user.Username,
		&user.Email,
		&user.Confirmed,
		&user.ConfirmedAt,
		&user.ConfirmedBy,
		&user.IsAdmin,
		&user.CreatedAt,
		&passwordHash,
	); err != nil {
		return dto.User{}, "", err
	}

	return user, passwordHash, nil
}

func (r *repo) CreateEmailToken(userID string, tokenHash string, purpose string, expiresAt time.Time) error {
	queryBuilder := sq.Insert("auth_email_tokens").
		Columns("user_id", "token_hash", "purpose", "expires_at").
		Values(userID, tokenHash, purpose, expiresAt).
		PlaceholderFormat(sq.Dollar)

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return err
	}

	query := db.Query{
		Name:     "auth_email_token.create",
		QueryRaw: queryRaw,
	}
	_, err = r.db.DB().ExecContext(context.Background(), query, args...)
	return err
}

func (r *repo) ConsumeEmailToken(tokenHash string, purpose string) (dto.User, error) {
	queryRaw := `
UPDATE auth_email_tokens
SET used_at = now()
WHERE token_hash = $1
  AND purpose = $2
  AND used_at IS NULL
  AND expires_at > now()
RETURNING user_id`

	query := db.Query{
		Name:     "auth_email_token.consume",
		QueryRaw: queryRaw,
	}

	var userID string
	if err := r.db.DB().QueryRowContext(context.Background(), query, tokenHash, purpose).Scan(&userID); err != nil {
		return dto.User{}, err
	}

	userQueryBuilder := sq.Select("id", "username", "email", "confirmed", "confirmed_at", "confirmed_by", "is_admin", "created_at").
		From("users").
		Where(sq.Eq{"id": userID}).
		PlaceholderFormat(sq.Dollar)

	userQueryRaw, args, err := userQueryBuilder.ToSql()
	if err != nil {
		return dto.User{}, err
	}

	userQuery := db.Query{
		Name:     "auth_email_token.user",
		QueryRaw: userQueryRaw,
	}

	var user dto.User
	row := r.db.DB().QueryRowContext(context.Background(), userQuery, args...)
	if err := row.Scan(
		&user.ID,
		&user.Username,
		&user.Email,
		&user.Confirmed,
		&user.ConfirmedAt,
		&user.ConfirmedBy,
		&user.IsAdmin,
		&user.CreatedAt,
	); err != nil {
		return dto.User{}, err
	}

	return user, nil
}

var _ repository.AuthCredentialRepository = (*repo)(nil)
