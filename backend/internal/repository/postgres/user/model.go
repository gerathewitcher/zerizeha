package pg_user_repo

import "time"

type User struct {
	id          string
	username    string
	email       string
	confirmed   bool
	confirmedAt *time.Time
	confirmedBy *string
	isAdmin     bool
	createdAt   time.Time
}
