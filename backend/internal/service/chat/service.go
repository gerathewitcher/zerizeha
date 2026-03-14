package chat

import (
	"context"
	"time"

	"zerizeha/internal/dto"
	"zerizeha/internal/repository"
	"zerizeha/internal/service"
)

type serv struct {
	repo      repository.ChatRepository
	space     service.SpaceService
	publisher service.ChatEventPublisher
	ttl       time.Duration
}

// NewChatService constructs the chat service with repository access and retention policy.
func NewChatService(repo repository.ChatRepository, space service.SpaceService, publisher service.ChatEventPublisher, ttl time.Duration) service.ChatService {
	return &serv{repo: repo, space: space, publisher: publisher, ttl: ttl}
}

func (s *serv) CreateChannelMessage(message dto.ChannelMessageToCreate) (string, error) {
	messageID, err := s.repo.CreateChannelMessage(message)
	if err != nil {
		return "", err
	}

	createdMessage, err := s.repo.GetChannelMessageByID(messageID)
	if err != nil {
		return "", err
	}

	channel, err := s.space.GetChannelByID(createdMessage.ChannelID)
	if err != nil {
		return "", err
	}

	members, err := s.space.ListSpaceMembers(channel.SpaceID)
	if err != nil {
		return "", err
	}

	if err := s.publisher.PublishChannelMessageCreated(uniqueSpaceMemberUserIDs(members), dto.ChannelMessageCreatedEvent{
		SpaceID:   channel.SpaceID,
		ChannelID: channel.ID,
		Message:   createdMessage,
	}); err != nil {
		return "", err
	}

	return messageID, nil
}

func (s *serv) GetChannelMessageByID(id string) (dto.ChannelMessage, error) {
	return s.repo.GetChannelMessageByID(id)
}

func (s *serv) ListChannelMessages(channelID string, limit int, cursor *dto.ChannelMessageCursor) ([]dto.ChannelMessage, *dto.ChannelMessageCursor, error) {
	return s.repo.ListChannelMessages(channelID, limit, cursor)
}

func (s *serv) CleanupExpiredMessages(_ context.Context) error {
	if s.ttl <= 0 {
		return nil
	}

	cutoff := time.Now().Add(-s.ttl)
	results, err := s.repo.DeleteChannelMessagesBefore(cutoff)
	if err != nil {
		return err
	}

	for _, result := range results {
		channel, err := s.space.GetChannelByID(result.ChannelID)
		if err != nil {
			return err
		}

		members, err := s.space.ListSpaceMembers(channel.SpaceID)
		if err != nil {
			return err
		}

		if err := s.publisher.PublishChannelCompacted(uniqueSpaceMemberUserIDs(members), dto.ChannelCompactedEvent{
			SpaceID:       channel.SpaceID,
			ChannelID:     channel.ID,
			DeletedCount:  result.DeletedCount,
			DeletedBefore: result.DeletedBefore,
		}); err != nil {
			return err
		}
	}

	return nil
}

func uniqueSpaceMemberUserIDs(members []dto.SpaceMemberWithUser) []string {
	userIDs := make([]string, 0, len(members))
	seen := make(map[string]struct{}, len(members))
	for _, member := range members {
		if _, ok := seen[member.UserID]; ok {
			continue
		}
		seen[member.UserID] = struct{}{}
		userIDs = append(userIDs, member.UserID)
	}
	return userIDs
}
