package dto

import "time"

type User struct {
	ID        string    `json:"id"`
	Username  string    `json:"username"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"created_at"`
}

type UserToCreate struct {
	Username string `json:"username"`
	Email    string `json:"email"`
}
