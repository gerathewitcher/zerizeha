package pg_user_repo

import "time"

type User struct {
	id        string
	username  string
	email     string
	createdAt time.Time
}
