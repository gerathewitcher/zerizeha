package pg_user_repo

import (
	"context"

	sq "github.com/Masterminds/squirrel"

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
	queryBuilder := sq.Select("id", "username", "email", "created_at").
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
	if err := row.Scan(&user.id, &user.username, &user.email, &user.createdAt); err != nil {
		return dto.User{}, err
	}

	return *ToUserFromRepo(user), nil
}

func (r *repo) GetUserByEmail(email string) (dto.User, error) {
	queryBuilder := sq.Select("id", "username", "email", "created_at").
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
	if err := row.Scan(&user.id, &user.username, &user.email, &user.createdAt); err != nil {
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
