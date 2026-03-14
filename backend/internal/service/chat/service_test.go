package chat

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"zerizeha/internal/dto"
)

// TestCreateChannelMessagePublishesEventToUniqueSpaceMembers verifies that
// creating a message emits a realtime event to deduplicated space members.
func TestCreateChannelMessagePublishesEventToUniqueSpaceMembers(t *testing.T) {
	t.Parallel()

	// given
	createdAt := time.Date(2026, 3, 14, 12, 0, 0, 0, time.UTC)
	message := dto.ChannelMessage{
		ID:        "msg-1",
		ChannelID: "channel-1",
		AuthorID:  "author-1",
		Body:      "hello",
		CreatedAt: createdAt,
		Author: dto.ChannelMessageAuthor{
			ID:       "author-1",
			Username: "gera",
			IsAdmin:  true,
		},
	}

	repo := &chatRepoStub{
		createChannelMessageID: "msg-1",
		messageByID:            message,
	}
	space := &spaceServiceStub{
		channelByID: dto.Channel{
			ID:      "channel-1",
			SpaceID: "space-1",
		},
		spaceMembers: []dto.SpaceMemberWithUser{
			{UserID: "user-1"},
			{UserID: "user-2"},
			{UserID: "user-1"},
		},
	}
	publisher := &chatEventPublisherStub{}
	svc := NewChatService(repo, space, publisher, time.Hour)

	// when
	messageID, err := svc.CreateChannelMessage(dto.ChannelMessageToCreate{
		ChannelID: "channel-1",
		AuthorID:  "author-1",
		Body:      "hello",
	})

	// then
	if err != nil {
		t.Fatalf("CreateChannelMessage() error = %v", err)
	}
	if messageID != "msg-1" {
		t.Fatalf("CreateChannelMessage() messageID = %q, want %q", messageID, "msg-1")
	}

	if !reflect.DeepEqual(publisher.publishedCreatedRecipientUserIDs, []string{"user-1", "user-2"}) {
		t.Fatalf("PublishChannelMessageCreated() recipients = %v, want %v", publisher.publishedCreatedRecipientUserIDs, []string{"user-1", "user-2"})
	}
	if !reflect.DeepEqual(publisher.publishedCreatedEvent, dto.ChannelMessageCreatedEvent{
		SpaceID:   "space-1",
		ChannelID: "channel-1",
		Message:   message,
	}) {
		t.Fatalf("PublishChannelMessageCreated() event = %+v", publisher.publishedCreatedEvent)
	}
}

// TestCleanupExpiredMessagesPublishesCompactedEvents verifies that chat cleanup
// publishes one compaction event per affected channel.
func TestCleanupExpiredMessagesPublishesCompactedEvents(t *testing.T) {
	t.Parallel()

	// given
	before := time.Date(2026, 3, 14, 12, 0, 0, 0, time.UTC)
	repo := &chatRepoStub{
		deleteResults: []dto.ChannelMessageCleanupResult{
			{
				ChannelID:     "channel-1",
				DeletedCount:  2,
				DeletedBefore: before,
			},
		},
	}
	space := &spaceServiceStub{
		channelByID: dto.Channel{
			ID:      "channel-1",
			SpaceID: "space-1",
		},
		spaceMembers: []dto.SpaceMemberWithUser{
			{UserID: "user-1"},
			{UserID: "user-2"},
		},
	}
	publisher := &chatEventPublisherStub{}
	svc := NewChatService(repo, space, publisher, time.Hour)

	// when
	if err := svc.CleanupExpiredMessages(context.Background()); err != nil {
		t.Fatalf("CleanupExpiredMessages() error = %v", err)
	}

	// then
	if repo.deleteBefore.IsZero() {
		t.Fatal("CleanupExpiredMessages() did not call DeleteChannelMessagesBefore")
	}
	if !reflect.DeepEqual(publisher.publishedCompactedRecipientUserIDs, []string{"user-1", "user-2"}) {
		t.Fatalf("PublishChannelCompacted() recipients = %v, want %v", publisher.publishedCompactedRecipientUserIDs, []string{"user-1", "user-2"})
	}
	if !reflect.DeepEqual(publisher.publishedCompactedEvent, dto.ChannelCompactedEvent{
		SpaceID:       "space-1",
		ChannelID:     "channel-1",
		DeletedCount:  2,
		DeletedBefore: before,
	}) {
		t.Fatalf("PublishChannelCompacted() event = %+v", publisher.publishedCompactedEvent)
	}
}

// TestCleanupExpiredMessagesSkipsWhenTTLDisabled verifies that cleanup is a
// no-op when message retention is disabled.
func TestCleanupExpiredMessagesSkipsWhenTTLDisabled(t *testing.T) {
	t.Parallel()

	// given
	repo := &chatRepoStub{}
	svc := NewChatService(repo, &spaceServiceStub{}, &chatEventPublisherStub{}, 0)

	// when
	if err := svc.CleanupExpiredMessages(context.Background()); err != nil {
		t.Fatalf("CleanupExpiredMessages() error = %v", err)
	}

	// then
	if !repo.deleteBefore.IsZero() {
		t.Fatal("CleanupExpiredMessages() called DeleteChannelMessagesBefore with disabled TTL")
	}
}

// TestCreateChannelMessageReturnsPublisherError verifies that publisher
// failures are returned to the caller.
func TestCreateChannelMessageReturnsPublisherError(t *testing.T) {
	t.Parallel()

	// given
	expectedErr := errors.New("publish failed")
	repo := &chatRepoStub{
		createChannelMessageID: "msg-1",
		messageByID: dto.ChannelMessage{
			ID:        "msg-1",
			ChannelID: "channel-1",
		},
	}
	space := &spaceServiceStub{
		channelByID: dto.Channel{
			ID:      "channel-1",
			SpaceID: "space-1",
		},
		spaceMembers: []dto.SpaceMemberWithUser{{UserID: "user-1"}},
	}
	publisher := &chatEventPublisherStub{
		publishCreatedErr: expectedErr,
	}
	svc := NewChatService(repo, space, publisher, time.Hour)

	// when
	_, err := svc.CreateChannelMessage(dto.ChannelMessageToCreate{
		ChannelID: "channel-1",
		AuthorID:  "author-1",
		Body:      "hello",
	})

	// then
	if !errors.Is(err, expectedErr) {
		t.Fatalf("CreateChannelMessage() error = %v, want %v", err, expectedErr)
	}
}

type chatRepoStub struct {
	createChannelMessageID  string
	createChannelMessageErr error
	messageByID             dto.ChannelMessage
	messageByIDErr          error
	listMessages            []dto.ChannelMessage
	listNextCursor          *dto.ChannelMessageCursor
	listErr                 error
	deleteResults           []dto.ChannelMessageCleanupResult
	deleteErr               error
	deleteBefore            time.Time
}

func (s *chatRepoStub) CreateChannelMessage(_ dto.ChannelMessageToCreate) (string, error) {
	return s.createChannelMessageID, s.createChannelMessageErr
}

func (s *chatRepoStub) GetChannelMessageByID(_ string) (dto.ChannelMessage, error) {
	return s.messageByID, s.messageByIDErr
}

func (s *chatRepoStub) ListChannelMessages(_ string, _ int, _ *dto.ChannelMessageCursor) ([]dto.ChannelMessage, *dto.ChannelMessageCursor, error) {
	return s.listMessages, s.listNextCursor, s.listErr
}

func (s *chatRepoStub) DeleteChannelMessagesBefore(createdBefore time.Time) ([]dto.ChannelMessageCleanupResult, error) {
	s.deleteBefore = createdBefore
	return s.deleteResults, s.deleteErr
}

type spaceServiceStub struct {
	channelByID     dto.Channel
	channelByIDErr  error
	spaceMembers    []dto.SpaceMemberWithUser
	spaceMembersErr error
}

func (s *spaceServiceStub) CreateSpace(dto.SpaceToCreate) (string, error)     { return "", nil }
func (s *spaceServiceStub) ListSpaces() ([]dto.Space, error)                  { return nil, nil }
func (s *spaceServiceStub) ListSpacesByUser(string) ([]dto.Space, error)      { return nil, nil }
func (s *spaceServiceStub) GetSpaceByID(string) (dto.Space, error)            { return dto.Space{}, nil }
func (s *spaceServiceStub) UpdateSpace(string, dto.SpaceToUpdate) error       { return nil }
func (s *spaceServiceStub) DeleteSpace(string) error                          { return nil }
func (s *spaceServiceStub) CreateChannel(dto.ChannelToCreate) (string, error) { return "", nil }
func (s *spaceServiceStub) ListChannelsBySpace(string) ([]dto.Channel, error) { return nil, nil }
func (s *spaceServiceStub) GetChannelByID(string) (dto.Channel, error) {
	return s.channelByID, s.channelByIDErr
}
func (s *spaceServiceStub) UpdateChannel(string, dto.ChannelToUpdate) error           { return nil }
func (s *spaceServiceStub) DeleteChannel(string) error                                { return nil }
func (s *spaceServiceStub) CreateSpaceMember(dto.SpaceMemberToCreate) (string, error) { return "", nil }
func (s *spaceServiceStub) DeleteSpaceMember(string) error                            { return nil }
func (s *spaceServiceStub) IsSpaceMember(string, string) (bool, error)                { return false, nil }
func (s *spaceServiceStub) GetSpaceMemberByID(string) (dto.SpaceMember, error) {
	return dto.SpaceMember{}, nil
}
func (s *spaceServiceStub) DeleteSpaceMemberBySpaceUser(string, string) error { return nil }
func (s *spaceServiceStub) ListSpaceMembers(string) ([]dto.SpaceMemberWithUser, error) {
	return s.spaceMembers, s.spaceMembersErr
}

type chatEventPublisherStub struct {
	publishedCreatedRecipientUserIDs   []string
	publishedCreatedEvent              dto.ChannelMessageCreatedEvent
	publishCreatedErr                  error
	publishedCompactedRecipientUserIDs []string
	publishedCompactedEvent            dto.ChannelCompactedEvent
	publishCompactedErr                error
}

func (s *chatEventPublisherStub) PublishChannelMessageCreated(recipientUserIDs []string, event dto.ChannelMessageCreatedEvent) error {
	s.publishedCreatedRecipientUserIDs = append([]string(nil), recipientUserIDs...)
	s.publishedCreatedEvent = event
	return s.publishCreatedErr
}

func (s *chatEventPublisherStub) PublishChannelCompacted(recipientUserIDs []string, event dto.ChannelCompactedEvent) error {
	s.publishedCompactedRecipientUserIDs = append([]string(nil), recipientUserIDs...)
	s.publishedCompactedEvent = event
	return s.publishCompactedErr
}
