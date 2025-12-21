package dto

import "time"

type Space struct {
	ID        string     `json:"id"`
	AuthorID  string     `json:"author_id"`
	Name      string     `json:"name"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt *time.Time `json:"updated_at,omitempty"`
}

type Channel struct {
	ID          string     `json:"id"`
	AuthorID    string     `json:"author_id"`
	SpaceID     string     `json:"space_id"`
	Name        string     `json:"name"`
	ChannelType string     `json:"channel_type"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   *time.Time `json:"updated_at,omitempty"`
}

type SpaceMember struct {
	ID        string    `json:"id"`
	SpaceID   string    `json:"space_id"`
	UserID    string    `json:"user_id"`
	CreatedAt time.Time `json:"created_at"`
}

type SpaceToCreate struct {
	AuthorID string `json:"author_id"`
	Name     string `json:"name"`
}

type ChannelToCreate struct {
	AuthorID    string `json:"author_id"`
	SpaceID     string `json:"space_id"`
	Name        string `json:"name"`
	ChannelType string `json:"channel_type"`
}

type SpaceMemberToCreate struct {
	SpaceID string `json:"space_id"`
	UserID  string `json:"user_id"`
}

type SpaceToUpdate struct {
	Name string `json:"name"`
}

type ChannelToUpdate struct {
	Name string `json:"name"`
}
