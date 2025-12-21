package pg_space_repo

import (
	"database/sql"
	"time"
)

type Space struct {
	id        string
	authorID  string
	name      string
	createdAt time.Time
	updatedAt sql.NullTime
}

type Channel struct {
	id          string
	authorID    string
	spaceID     string
	name        string
	channelType string
	createdAt   time.Time
	updatedAt   sql.NullTime
}

type SpaceMember struct {
	id        string
	spaceID   string
	userID    string
	createdAt time.Time
}
