package pg_chat_repo

import "time"

type ChannelMessage struct {
	id             string
	channelID      string
	authorID       string
	authorUsername string
	authorIsAdmin  bool
	body           string
	createdAt      time.Time
}
