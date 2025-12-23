package pg_space_repo

import (
	"context"

	sq "github.com/Masterminds/squirrel"
	"github.com/jackc/pgx/v5"

	"zerizeha/internal/dto"
	"zerizeha/internal/repository"
	"zerizeha/pkg/db"
)

type repo struct {
	db db.Client
}

func NewPostgresSpaceRepo(db db.Client) repository.SpaceRepository {
	return &repo{
		db: db,
	}
}

func (r *repo) CreateSpace(space dto.SpaceToCreate) (spaceID string, err error) {
	ctx := context.Background()

	tx, err := r.db.DB().BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return "", err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()

	queryBuilder := sq.Insert("spaces").
		Columns("name", "author_id").
		Values(space.Name, space.AuthorID).
		Suffix("RETURNING id").
		PlaceholderFormat(sq.Dollar)

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return "", err
	}

	row := tx.QueryRow(ctx, queryRaw, args...)
	if err := row.Scan(&spaceID); err != nil {
		return "", err
	}

	memberQueryBuilder := sq.Insert("space_members").
		Columns("space_id", "user_id").
		Values(spaceID, space.AuthorID).
		PlaceholderFormat(sq.Dollar)

	memberQueryRaw, memberArgs, err := memberQueryBuilder.ToSql()
	if err != nil {
		return "", err
	}

	if _, err := tx.Exec(ctx, memberQueryRaw, memberArgs...); err != nil {
		return "", err
	}

	if err := tx.Commit(ctx); err != nil {
		return "", err
	}

	return spaceID, nil
}

func (r *repo) ListSpaces() ([]dto.Space, error) {
	queryBuilder := sq.Select("id", "author_id", "name", "created_at", "updated_at").
		From("spaces").
		OrderBy("created_at desc").
		PlaceholderFormat(sq.Dollar)

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return nil, err
	}

	query := db.Query{
		Name:     "space.list",
		QueryRaw: queryRaw,
	}

	rows, err := r.db.DB().QueryContext(context.Background(), query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []dto.Space
	for rows.Next() {
		var space Space
		if err := rows.Scan(&space.id, &space.authorID, &space.name, &space.createdAt, &space.updatedAt); err != nil {
			return nil, err
		}
		result = append(result, ToSpaceFromRepo(space))
	}

	return result, nil
}

func (r *repo) ListSpacesByUser(userID string) ([]dto.Space, error) {
	queryBuilder := sq.
		Select("s.id", "s.author_id", "s.name", "s.created_at", "s.updated_at").
		From("spaces s").
		Join("space_members sm ON sm.space_id = s.id").
		Where(sq.Eq{"sm.user_id": userID}).
		OrderBy("s.created_at desc").
		PlaceholderFormat(sq.Dollar)

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return nil, err
	}

	query := db.Query{
		Name:     "space.list_by_user",
		QueryRaw: queryRaw,
	}

	rows, err := r.db.DB().QueryContext(context.Background(), query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []dto.Space
	for rows.Next() {
		var space Space
		if err := rows.Scan(&space.id, &space.authorID, &space.name, &space.createdAt, &space.updatedAt); err != nil {
			return nil, err
		}
		result = append(result, ToSpaceFromRepo(space))
	}

	return result, nil
}

func (r *repo) GetSpaceByID(id string) (dto.Space, error) {
	queryBuilder := sq.Select("id", "author_id", "name", "created_at", "updated_at").
		From("spaces").
		Where(sq.Eq{"id": id}).
		PlaceholderFormat(sq.Dollar)

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return dto.Space{}, err
	}

	query := db.Query{
		Name:     "space.get_by_id",
		QueryRaw: queryRaw,
	}

	var space Space
	row := r.db.DB().QueryRowContext(context.Background(), query, args...)
	if err := row.Scan(&space.id, &space.authorID, &space.name, &space.createdAt, &space.updatedAt); err != nil {
		return dto.Space{}, err
	}

	return ToSpaceFromRepo(space), nil
}
func (r *repo) UpdateSpace(id string, space dto.SpaceToUpdate) error {
	queryBuilder := sq.Update("spaces").
		Set("name", space.Name).
		Set("updated_at", sq.Expr("now()")).
		Where(sq.Eq{"id": id}).
		PlaceholderFormat(sq.Dollar)

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return err
	}

	query := db.Query{
		Name:     "space.update",
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
func (r *repo) DeleteSpace(id string) error {
	queryBuilder := sq.Delete("spaces").
		Where(sq.Eq{"id": id}).
		PlaceholderFormat(sq.Dollar)

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return err
	}

	query := db.Query{
		Name:     "space.delete",
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

func (r *repo) CreateChannel(channel dto.ChannelToCreate) (channelID string, err error) {
	queryBuilder := sq.Insert("channels").
		Columns("space_id", "name", "channel_type", "author_id").
		Values(channel.SpaceID, channel.Name, channel.ChannelType, channel.AuthorID).
		Suffix("RETURNING id").
		PlaceholderFormat(sq.Dollar)

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return "", err
	}

	query := db.Query{
		Name:     "channel.create",
		QueryRaw: queryRaw,
	}

	row := r.db.DB().QueryRowContext(context.Background(), query, args...)
	if err := row.Scan(&channelID); err != nil {
		return "", err
	}

	return channelID, nil
}

func (r *repo) ListChannelsBySpace(spaceID string) ([]dto.Channel, error) {
	queryBuilder := sq.Select("id", "author_id", "space_id", "name", "channel_type", "created_at", "updated_at").
		From("channels").
		Where(sq.Eq{"space_id": spaceID}).
		OrderBy("created_at asc").
		PlaceholderFormat(sq.Dollar)

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return nil, err
	}

	query := db.Query{
		Name:     "channel.list_by_space",
		QueryRaw: queryRaw,
	}

	rows, err := r.db.DB().QueryContext(context.Background(), query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []dto.Channel
	for rows.Next() {
		var channel Channel
		if err := rows.Scan(
			&channel.id,
			&channel.authorID,
			&channel.spaceID,
			&channel.name,
			&channel.channelType,
			&channel.createdAt,
			&channel.updatedAt,
		); err != nil {
			return nil, err
		}
		result = append(result, ToChannelFromRepo(channel))
	}

	return result, nil
}

func (r *repo) GetChannelByID(id string) (dto.Channel, error) {
	queryBuilder := sq.Select("id", "author_id", "space_id", "name", "channel_type", "created_at", "updated_at").
		From("channels").
		Where(sq.Eq{"id": id}).
		PlaceholderFormat(sq.Dollar)

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return dto.Channel{}, err
	}

	query := db.Query{
		Name:     "channel.get_by_id",
		QueryRaw: queryRaw,
	}

	var channel Channel
	row := r.db.DB().QueryRowContext(context.Background(), query, args...)
	if err := row.Scan(
		&channel.id,
		&channel.authorID,
		&channel.spaceID,
		&channel.name,
		&channel.channelType,
		&channel.createdAt,
		&channel.updatedAt,
	); err != nil {
		return dto.Channel{}, err
	}

	return ToChannelFromRepo(channel), nil
}
func (r *repo) UpdateChannel(id string, channel dto.ChannelToUpdate) error {
	queryBuilder := sq.Update("channels").
		Set("name", channel.Name).
		Set("updated_at", sq.Expr("now()")).
		Where(sq.Eq{"id": id}).
		PlaceholderFormat(sq.Dollar)

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return err
	}

	query := db.Query{
		Name:     "channel.update",
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
func (r *repo) DeleteChannel(id string) error {
	queryBuilder := sq.Delete("channels").
		Where(sq.Eq{"id": id}).
		PlaceholderFormat(sq.Dollar)

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return err
	}

	query := db.Query{
		Name:     "channel.delete",
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

func (r *repo) CreateSpaceMember(spaceMember dto.SpaceMemberToCreate) (spaceMemberID string, err error) {
	queryBuilder := sq.Insert("space_members").
		Columns("space_id", "user_id").
		Values(spaceMember.SpaceID, spaceMember.UserID).
		Suffix("RETURNING id").
		PlaceholderFormat(sq.Dollar)

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return "", err
	}

	query := db.Query{
		Name:     "space_member.create",
		QueryRaw: queryRaw,
	}

	row := r.db.DB().QueryRowContext(context.Background(), query, args...)
	if err := row.Scan(&spaceMemberID); err != nil {
		return "", err
	}

	return spaceMemberID, nil
}
func (r *repo) DeleteSpaceMember(id string) error {
	queryBuilder := sq.Delete("space_members").
		Where(sq.Eq{"id": id}).
		PlaceholderFormat(sq.Dollar)

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return err
	}

	query := db.Query{
		Name:     "space_member.delete",
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

func (r *repo) IsSpaceMember(spaceID string, userID string) (bool, error) {
	queryBuilder := sq.Select("1").
		From("space_members").
		Where(sq.Eq{"space_id": spaceID, "user_id": userID}).
		Limit(1).
		PlaceholderFormat(sq.Dollar)

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return false, err
	}

	query := db.Query{
		Name:     "space_member.exists",
		QueryRaw: queryRaw,
	}

	var one int
	err = r.db.DB().QueryRowContext(context.Background(), query, args...).Scan(&one)
	if err != nil {
		if err == pgx.ErrNoRows {
			return false, nil
		}
		return false, err
	}

	return true, nil
}

func (r *repo) GetSpaceMemberByID(id string) (dto.SpaceMember, error) {
	queryBuilder := sq.Select("id", "space_id", "user_id", "created_at").
		From("space_members").
		Where(sq.Eq{"id": id}).
		PlaceholderFormat(sq.Dollar)

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return dto.SpaceMember{}, err
	}

	query := db.Query{
		Name:     "space_member.get_by_id",
		QueryRaw: queryRaw,
	}

	var spaceMember SpaceMember
	row := r.db.DB().QueryRowContext(context.Background(), query, args...)
	if err := row.Scan(&spaceMember.id, &spaceMember.spaceID, &spaceMember.userID, &spaceMember.createdAt); err != nil {
		return dto.SpaceMember{}, err
	}

	return ToSpaceMemberFromRepo(spaceMember), nil
}

func (r *repo) DeleteSpaceMemberBySpaceUser(spaceID string, userID string) error {
	queryBuilder := sq.Delete("space_members").
		Where(sq.Eq{"space_id": spaceID, "user_id": userID}).
		PlaceholderFormat(sq.Dollar)

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return err
	}

	query := db.Query{
		Name:     "space_member.delete_by_space_user",
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

func (r *repo) ListSpaceMembers(spaceID string) ([]dto.SpaceMemberWithUser, error) {
	queryBuilder := sq.Select(
		"sm.id",
		"sm.space_id",
		"sm.user_id",
		"u.username",
		"u.email",
		"u.is_admin",
		"sm.created_at",
	).
		From("space_members sm").
		Join("users u ON u.id = sm.user_id").
		Where(sq.Eq{"sm.space_id": spaceID}).
		OrderBy("sm.created_at asc").
		PlaceholderFormat(sq.Dollar)

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return nil, err
	}

	query := db.Query{
		Name:     "space_member.list_by_space",
		QueryRaw: queryRaw,
	}

	rows, err := r.db.DB().QueryContext(context.Background(), query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]dto.SpaceMemberWithUser, 0)
	for rows.Next() {
		var item dto.SpaceMemberWithUser
		if err := rows.Scan(
			&item.SpaceMemberID,
			&item.SpaceID,
			&item.UserID,
			&item.Username,
			&item.Email,
			&item.IsAdmin,
			&item.CreatedAt,
		); err != nil {
			return nil, err
		}
		result = append(result, item)
	}

	return result, nil
}
