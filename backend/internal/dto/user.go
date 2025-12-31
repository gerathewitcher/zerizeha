package dto

import "time"

type User struct {
	ID          string     `json:"id"`
	Username    string     `json:"username"`
	Email       string     `json:"email"`
	Confirmed   bool       `json:"confirmed"`
	ConfirmedAt *time.Time `json:"confirmed_at,omitempty"`
	ConfirmedBy *string    `json:"confirmed_by,omitempty"`
	IsAdmin     bool       `json:"is_admin"`
	CreatedAt   time.Time  `json:"created_at"`
}

type UserToCreate struct {
	Username string `json:"username"`
	Email    string `json:"email"`
}

type UserToUpdate struct {
	Username *string `json:"username,omitempty"`
}

type UserSearchCursor struct {
	CreatedAt time.Time `json:"created_at"`
	ID        string    `json:"id"`
}
