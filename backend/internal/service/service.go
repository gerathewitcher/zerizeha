package service

import (
	"context"
	"encoding/json"
	"zerizeha/internal/dto"
)

type UserService interface {
	CreateUser(user dto.UserToCreate) (userID string, err error)
	GetUserByID(id string) (dto.User, error)
	GetUserByEmail(email string) (dto.User, error)
	ListUsers() ([]dto.User, error)
	GetUsersByIDs(ids []string) ([]dto.User, error)
	SearchUsers(query string, limit int, cursor *dto.UserSearchCursor, confirmedOnly bool, confirmedFilter *bool) ([]dto.User, *dto.UserSearchCursor, error)
	SetUserConfirmed(id string, confirmed bool, confirmedBy string) error
	SyncAdminsByEmails(emails []string) error
}

type SpaceService interface {
	CreateSpace(space dto.SpaceToCreate) (spaceID string, err error)
	ListSpaces() ([]dto.Space, error)
	ListSpacesByUser(userID string) ([]dto.Space, error)
	GetSpaceByID(id string) (dto.Space, error)
	UpdateSpace(id string, space dto.SpaceToUpdate) error
	DeleteSpace(id string) error

	CreateChannel(channel dto.ChannelToCreate) (channelID string, err error)
	ListChannelsBySpace(spaceID string) ([]dto.Channel, error)
	GetChannelByID(id string) (dto.Channel, error)
	UpdateChannel(id string, channel dto.ChannelToUpdate) error
	DeleteChannel(id string) error

	CreateSpaceMember(spaceMember dto.SpaceMemberToCreate) (spaceMemberID string, err error)
	DeleteSpaceMember(id string) error

	IsSpaceMember(spaceID string, userID string) (bool, error)
	GetSpaceMemberByID(id string) (dto.SpaceMember, error)
	DeleteSpaceMemberBySpaceUser(spaceID string, userID string) error
	ListSpaceMembers(spaceID string) ([]dto.SpaceMemberWithUser, error)
}

type VoiceService interface {
	Join(ctx context.Context, userID string, channelID string) error
	Leave(ctx context.Context, userID string) error
	Heartbeat(ctx context.Context, userID string) error
	ListMemberIDs(ctx context.Context, channelID string) ([]string, error)
	GetUserChannelID(ctx context.Context, userID string) (string, error)
	SetUserState(ctx context.Context, userID string, state VoiceState) error
	GetUserStates(ctx context.Context, userIDs []string) (map[string]VoiceState, error)
}

type JanusService interface {
	CreateSession(ctx context.Context) (sessionID int64, err error)
	KeepAlive(ctx context.Context, sessionID int64) error
	DestroySession(ctx context.Context, sessionID int64) error

	AttachVideoroom(ctx context.Context, sessionID int64) (handleID int64, err error)
	Detach(ctx context.Context, sessionID int64, handleID int64) error

	EnsureRoom(ctx context.Context, sessionID int64, handleID int64, roomID string) error
	JoinPublisher(ctx context.Context, sessionID int64, handleID int64, roomID string, display string) (selfID string, publishers []JanusPublisher, err error)
	Publish(ctx context.Context, sessionID int64, handleID int64, offer JanusJSEP) (answer JanusJSEP, err error)

	AttachSubscriber(ctx context.Context, sessionID int64) (handleID int64, err error)
	JoinSubscriber(ctx context.Context, sessionID int64, handleID int64, roomID string, feedID string) (offer JanusJSEP, err error)
	StartSubscriber(ctx context.Context, sessionID int64, handleID int64, answer JanusJSEP) error

	Trickle(ctx context.Context, sessionID int64, handleID int64, candidate json.RawMessage) error
}

type JanusJSEP struct {
	Type string `json:"type"`
	SDP  string `json:"sdp"`
}

type JanusPublisher struct {
	FeedID  string `json:"feed_id"`
	Display string `json:"display"`
}

type VoiceState struct {
	Muted    bool `json:"muted"`
	Deafened bool `json:"deafened"`
}
