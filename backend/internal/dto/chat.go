package dto

import "time"

type ChannelMessage struct {
	ID        string               `json:"id"`
	ChannelID string               `json:"channel_id"`
	AuthorID  string               `json:"author_id"`
	Author    ChannelMessageAuthor `json:"author"`
	Body      string               `json:"body"`
	CreatedAt time.Time            `json:"created_at"`
}

type ChannelMessageAuthor struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	IsAdmin  bool   `json:"is_admin"`
}

type ChannelMessageToCreate struct {
	ChannelID string `json:"channel_id"`
	AuthorID  string `json:"author_id"`
	Body      string `json:"body"`
}

type ChannelMessageCursor struct {
	CreatedAt time.Time `json:"created_at"`
	ID        string    `json:"id"`
}

type ChannelMessageCreatedEvent struct {
	SpaceID   string         `json:"space_id"`
	ChannelID string         `json:"channel_id"`
	Message   ChannelMessage `json:"message"`
}

type ChannelMessageCleanupResult struct {
	ChannelID     string    `json:"channel_id"`
	DeletedCount  int       `json:"deleted_count"`
	DeletedBefore time.Time `json:"deleted_before"`
}

type ChannelCompactedEvent struct {
	SpaceID       string    `json:"space_id"`
	ChannelID     string    `json:"channel_id"`
	DeletedCount  int       `json:"deleted_count"`
	DeletedBefore time.Time `json:"deleted_before"`
}
