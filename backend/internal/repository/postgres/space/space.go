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
	queryBuilder := sq.Insert("spaces").
		Columns("name", "author_id").
		Values(space.Name, space.AuthorID).
		Suffix("RETURNING id").
		PlaceholderFormat(sq.Dollar)

	queryRaw, args, err := queryBuilder.ToSql()
	if err != nil {
		return "", err
	}

	query := db.Query{
		Name:     "space.create",
		QueryRaw: queryRaw,
	}

	row := r.db.DB().QueryRowContext(context.Background(), query, args...)
	if err := row.Scan(&spaceID); err != nil {
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
