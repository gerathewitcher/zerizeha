package pg_user_repo

import (
	"context"
	"strings"

	sq "github.com/Masterminds/squirrel"
	"github.com/jackc/pgx/v5"

	"zerizeha/internal/dto"
	"zerizeha/internal/repository"
	"zerizeha/pkg/db"
)

type repo struct {
	db db.Client
}

func NewPostgresUserRepo(db db.Client) repository.UserRepository {
	return &repo{
		db: db,
	}
}

func (r *repo) GetUserByID(id string) (dto.User, error) {
	queryBuilder := sq.Select("id", "username", "email", "confirmed", "confirmed_at", "confirmed_by", "is_admin", "created_at").
		From("users").
		Where(sq.Eq{"id": id}).
		PlaceholderFormat(sq.Dollar)

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return dto.User{}, err
	}

	query := db.Query{
		Name:     "user.get_by_id",
		QueryRaw: queryRaw,
	}

	var user User
	row := r.db.DB().QueryRowContext(context.Background(), query, args...)
	if err := row.Scan(
		&user.id,
		&user.username,
		&user.email,
		&user.confirmed,
		&user.confirmedAt,
		&user.confirmedBy,
		&user.isAdmin,
		&user.createdAt,
	); err != nil {
		return dto.User{}, err
	}

	return *ToUserFromRepo(user), nil
}

func (r *repo) GetUserByEmail(email string) (dto.User, error) {
	queryBuilder := sq.Select("id", "username", "email", "confirmed", "confirmed_at", "confirmed_by", "is_admin", "created_at").
		From("users").
		Where(sq.Eq{"email": email}).
		PlaceholderFormat(sq.Dollar)

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return dto.User{}, err
	}

	query := db.Query{
		Name:     "user.get_by_email",
		QueryRaw: queryRaw,
	}

	var user User
	row := r.db.DB().QueryRowContext(context.Background(), query, args...)
	if err := row.Scan(
		&user.id,
		&user.username,
		&user.email,
		&user.confirmed,
		&user.confirmedAt,
		&user.confirmedBy,
		&user.isAdmin,
		&user.createdAt,
	); err != nil {
		return dto.User{}, err
	}

	return *ToUserFromRepo(user), nil
}

func (r *repo) CreateUser(user dto.UserToCreate) (string, error) {
	queryBuilder := sq.Insert("users").
		Columns("username", "email").
		Values(user.Username, user.Email).
		Suffix("RETURNING id").
		PlaceholderFormat(sq.Dollar)

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return "", err
	}

	query := db.Query{
		Name:     "user.create",
		QueryRaw: queryRaw,
	}

	var userID string
	row := r.db.DB().QueryRowContext(context.Background(), query, args...)
	if err := row.Scan(&userID); err != nil {
		return "", err
	}

	return userID, nil
}

func (r *repo) ListUsers() ([]dto.User, error) {
	queryBuilder := sq.Select("id", "username", "email", "confirmed", "confirmed_at", "confirmed_by", "is_admin", "created_at").
		From("users").
		OrderBy("created_at desc").
		PlaceholderFormat(sq.Dollar)

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return nil, err
	}

	query := db.Query{
		Name:     "user.list",
		QueryRaw: queryRaw,
	}

	rows, err := r.db.DB().QueryContext(context.Background(), query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]dto.User, 0)
	for rows.Next() {
		var user User
		if err := rows.Scan(
			&user.id,
			&user.username,
			&user.email,
			&user.confirmed,
			&user.confirmedAt,
			&user.confirmedBy,
			&user.isAdmin,
			&user.createdAt,
		); err != nil {
			return nil, err
		}
		result = append(result, *ToUserFromRepo(user))
	}

	return result, nil
}

func (r *repo) GetUsersByIDs(ids []string) ([]dto.User, error) {
	if len(ids) == 0 {
		return []dto.User{}, nil
	}

	queryBuilder := sq.Select("id", "username", "email", "confirmed", "confirmed_at", "confirmed_by", "is_admin", "created_at").
		From("users").
		Where(sq.Eq{"id": ids}).
		PlaceholderFormat(sq.Dollar)

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return nil, err
	}

	query := db.Query{
		Name:     "user.get_by_ids",
		QueryRaw: queryRaw,
	}

	rows, err := r.db.DB().QueryContext(context.Background(), query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]dto.User, 0, len(ids))
	for rows.Next() {
		var user User
		if err := rows.Scan(
			&user.id,
			&user.username,
			&user.email,
			&user.confirmed,
			&user.confirmedAt,
			&user.confirmedBy,
			&user.isAdmin,
			&user.createdAt,
		); err != nil {
			return nil, err
		}
		result = append(result, *ToUserFromRepo(user))
	}

	return result, nil
}

func (r *repo) SetUserConfirmed(id string, confirmed bool, confirmedBy string) error {
	queryBuilder := sq.Update("users").
		Set("confirmed", confirmed).
		Set("confirmed_at", sq.Expr("CASE WHEN ? THEN now() ELSE NULL END", confirmed)).
		Set("confirmed_by", sq.Expr("CASE WHEN ? THEN ?::uuid ELSE NULL END", confirmed, confirmedBy)).
		Where(sq.Eq{"id": id}).
		PlaceholderFormat(sq.Dollar)

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return err
	}

	query := db.Query{
		Name:     "user.set_confirmed",
		QueryRaw: queryRaw,
	}

	tag, err := r.db.DB().ExecContext(context.Background(), query, args...)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (r *repo) UpdateUserInfo(id string, user dto.UserToUpdate) error {
	queryBuilder := sq.Update("users").
		Where(sq.Eq{"id": id}).
		PlaceholderFormat(sq.Dollar)

	hasUpdates := false
	if user.Username != nil {
		queryBuilder = queryBuilder.Set("username", strings.TrimSpace(*user.Username))
		hasUpdates = true
	}

	if !hasUpdates {
		return nil
	}

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return err
	}

	query := db.Query{
		Name:     "user.update_username",
		QueryRaw: queryRaw,
	}

	tag, err := r.db.DB().ExecContext(context.Background(), query, args...)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (r *repo) SyncAdminsByEmails(emails []string) error {
	// Always drop existing admin flags to keep DB in sync with env.
	query := db.Query{
		Name:     "user.admins.reset",
		QueryRaw: "UPDATE users SET is_admin = false WHERE is_admin = true",
	}
	if _, err := r.db.DB().ExecContext(context.Background(), query); err != nil {
		return err
	}

	if len(emails) == 0 {
		return nil
	}

	queryBuilder := sq.Update("users").
		Set("is_admin", true).
		Set("confirmed", true).
		Set("confirmed_at", sq.Expr("COALESCE(confirmed_at, now())")).
		Where(sq.Eq{"email": emails}).
		PlaceholderFormat(sq.Dollar)

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return err
	}

	query = db.Query{
		Name:     "user.admins.sync",
		QueryRaw: queryRaw,
	}
	_, err = r.db.DB().ExecContext(context.Background(), query, args...)
	return err
}

func (r *repo) SearchUsers(query string, limit int, cursor *dto.UserSearchCursor, confirmedOnly bool, confirmedFilter *bool) ([]dto.User, *dto.UserSearchCursor, error) {
	query = strings.TrimSpace(query)
	if limit <= 0 || limit > 50 {
		limit = 20
	}

	queryBuilder := sq.Select("id", "username", "email", "confirmed", "confirmed_at", "confirmed_by", "is_admin", "created_at").
		From("users").
		OrderBy("created_at desc", "id desc").
		Limit(uint64(limit + 1)).
		PlaceholderFormat(sq.Dollar)

	if query != "" {
		like := "%" + strings.ToLower(query) + "%"
		queryBuilder = queryBuilder.Where(
			sq.Expr("lower(username) like ? OR lower(email) like ?", like, like),
		)
	}

	if confirmedOnly {
		queryBuilder = queryBuilder.Where(sq.Eq{"confirmed": true})
	} else if confirmedFilter != nil {
		queryBuilder = queryBuilder.Where(sq.Eq{"confirmed": *confirmedFilter})
	}

	if cursor != nil && !cursor.CreatedAt.IsZero() && cursor.ID != "" {
		queryBuilder = queryBuilder.Where(
			sq.Expr("(created_at, id) < (?, ?)", cursor.CreatedAt, cursor.ID),
		)
	}

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return nil, nil, err
	}

	q := db.Query{
		Name:     "user.search_keyset",
		QueryRaw: queryRaw,
	}

	rows, err := r.db.DB().QueryContext(context.Background(), q, args...)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	result := make([]dto.User, 0, limit+1)
	for rows.Next() {
		var user User
		if err := rows.Scan(
			&user.id,
			&user.username,
			&user.email,
			&user.confirmed,
			&user.confirmedAt,
			&user.confirmedBy,
			&user.isAdmin,
			&user.createdAt,
		); err != nil {
			return nil, nil, err
		}
		result = append(result, *ToUserFromRepo(user))
	}

	var nextCursor *dto.UserSearchCursor
	if len(result) > limit {
		last := result[limit-1]
		nextCursor = &dto.UserSearchCursor{CreatedAt: last.CreatedAt, ID: last.ID}
		result = result[:limit]
	}

	return result, nextCursor, nil
}
