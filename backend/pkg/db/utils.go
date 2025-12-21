package db

import (
	"database/sql"
	"time"
)

func NullTimeToPtr(t sql.NullTime) *time.Time {
	if t.Valid {
		return &t.Time
	}
	return nil
}
