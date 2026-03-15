package voicepresence

import (
	"context"
	"time"

	"zerizeha/internal/dto"
	"zerizeha/internal/service"
)

type serv struct {
	space     service.SpaceService
	user      service.UserService
	voice     service.VoiceService
	publisher service.VoiceEventPublisher
}

// New creates a voice presence orchestration service for stale-member cleanup
// and realtime channel member broadcasts.
func New(
	space service.SpaceService,
	user service.UserService,
	voice service.VoiceService,
	publisher service.VoiceEventPublisher,
) service.VoicePresenceService {
	return &serv{
		space:     space,
		user:      user,
		voice:     voice,
		publisher: publisher,
	}
}

// CleanupVoicePresence removes stale voice members across voice channels and
// publishes refreshed member lists for channels whose presence changed.
func (s *serv) CleanupVoicePresence(ctx context.Context) error {
	spaces, err := s.space.ListSpaces()
	if err != nil {
		return err
	}

	for _, space := range spaces {
		channels, err := s.space.ListChannelsBySpace(space.ID)
		if err != nil {
			return err
		}

		for _, channel := range channels {
			if channel.ChannelType != "voice" {
				continue
			}

			cleaned, err := s.voice.CleanupStaleMembers(ctx, channel.ID)
			if err != nil {
				return err
			}
			if !cleaned {
				continue
			}

			members, err := s.buildVoiceMembers(ctx, channel.ID)
			if err != nil {
				return err
			}

			spaceMembers, err := s.space.ListSpaceMembers(space.ID)
			if err != nil {
				return err
			}

			if err := s.publishChannelMembers(space.ID, channel.ID, members, spaceMembers); err != nil {
				return err
			}
		}
	}

	return nil
}

func (s *serv) buildVoiceMembers(ctx context.Context, channelID string) ([]dto.VoicePresenceMember, error) {
	ids, err := s.voice.ListMemberIDs(ctx, channelID)
	if err != nil {
		return nil, err
	}

	users, err := s.user.GetUsersByIDs(ids)
	if err != nil {
		return nil, err
	}
	states, _ := s.voice.GetUserStates(ctx, ids)

	userByID := make(map[string]struct {
		username string
		isAdmin  bool
	}, len(users))
	for _, u := range users {
		userByID[u.ID] = struct {
			username string
			isAdmin  bool
		}{
			username: u.Username,
			isAdmin:  u.IsAdmin,
		}
	}

	members := make([]dto.VoicePresenceMember, 0, len(ids))
	for _, uid := range ids {
		info, ok := userByID[uid]
		if !ok {
			continue
		}

		state := states[uid]
		members = append(members, dto.VoicePresenceMember{
			ID:       uid,
			Username: info.username,
			IsAdmin:  info.isAdmin,
			Muted:    state.Muted,
			Deafened: state.Deafened,
		})
	}

	return members, nil
}

func (s *serv) publishChannelMembers(spaceID string, channelID string, members []dto.VoicePresenceMember, spaceMembers []dto.SpaceMemberWithUser) error {
	if s.publisher == nil {
		return nil
	}

	return s.publisher.PublishChannelMembers(
		uniqueSpaceMemberUserIDs(spaceMembers),
		dto.VoiceChannelMembersEvent{
			SpaceID:   spaceID,
			ChannelID: channelID,
			Revision:  nextVoicePresenceRevision(),
			Members:   members,
		},
	)
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

func nextVoicePresenceRevision() int64 {
	return time.Now().UnixMicro()
}
