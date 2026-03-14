package pg_chat_repo

import "zerizeha/internal/dto"

func ToChannelMessageFromRepo(message ChannelMessage) dto.ChannelMessage {
	return dto.ChannelMessage{
		ID:        message.id,
		ChannelID: message.channelID,
		AuthorID:  message.authorID,
		Author: dto.ChannelMessageAuthor{
			ID:       message.authorID,
			Username: message.authorUsername,
			IsAdmin:  message.authorIsAdmin,
		},
		Body:      message.body,
		CreatedAt: message.createdAt,
	}
}
