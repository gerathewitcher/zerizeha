package space

import (
	"errors"
	"testing"

	"zerizeha/internal/dto"
)

// TestCreateChannelAcceptsSupportedTypes verifies that the service allows
// supported channel types and forwards them to the repository.
func TestCreateChannelAcceptsSupportedTypes(t *testing.T) {
	t.Parallel()

	// given
	repo := &spaceRepoStub{createChannelID: "channel-1"}
	svc := NewSpaceService(repo)

	// when
	channelID, err := svc.CreateChannel(dto.ChannelToCreate{
		AuthorID:    "user-1",
		SpaceID:     "space-1",
		Name:        "General",
		ChannelType: "VOICE",
	})

	// then
	if err != nil {
		t.Fatalf("CreateChannel() error = %v", err)
	}
	if channelID != "channel-1" {
		t.Fatalf("CreateChannel() channelID = %q, want %q", channelID, "channel-1")
	}
	if repo.createdChannel.ChannelType != "VOICE" {
		t.Fatalf("CreateChannel() forwarded channel type = %q, want %q", repo.createdChannel.ChannelType, "VOICE")
	}
}

// TestCreateChannelRejectsUnsupportedTypes verifies that invalid channel types
// are rejected before touching the repository.
func TestCreateChannelRejectsUnsupportedTypes(t *testing.T) {
	t.Parallel()

	// given
	repo := &spaceRepoStub{}
	svc := NewSpaceService(repo)

	// when
	channelID, err := svc.CreateChannel(dto.ChannelToCreate{
		AuthorID:    "user-1",
		SpaceID:     "space-1",
		Name:        "General",
		ChannelType: "forum",
	})

	// then
	if !errors.Is(err, ErrInvalidChannelType) {
		t.Fatalf("CreateChannel() error = %v, want %v", err, ErrInvalidChannelType)
	}
	if channelID != "" {
		t.Fatalf("CreateChannel() channelID = %q, want empty", channelID)
	}
	if repo.createChannelCalled {
		t.Fatal("CreateChannel() called repository for invalid channel type")
	}
}

type spaceRepoStub struct {
	createChannelCalled bool
	createChannelID     string
	createChannelErr    error
	createdChannel      dto.ChannelToCreate
}

func (s *spaceRepoStub) CreateSpace(dto.SpaceToCreate) (string, error) { return "", nil }
func (s *spaceRepoStub) ListSpaces() ([]dto.Space, error)              { return nil, nil }
func (s *spaceRepoStub) ListSpacesByUser(string) ([]dto.Space, error)  { return nil, nil }
func (s *spaceRepoStub) GetSpaceByID(string) (dto.Space, error)        { return dto.Space{}, nil }
func (s *spaceRepoStub) UpdateSpace(string, dto.SpaceToUpdate) error   { return nil }
func (s *spaceRepoStub) DeleteSpace(string) error                      { return nil }
func (s *spaceRepoStub) CreateChannel(channel dto.ChannelToCreate) (string, error) {
	s.createChannelCalled = true
	s.createdChannel = channel
	return s.createChannelID, s.createChannelErr
}
func (s *spaceRepoStub) ListChannelsBySpace(string) ([]dto.Channel, error) { return nil, nil }
func (s *spaceRepoStub) GetChannelByID(string) (dto.Channel, error)        { return dto.Channel{}, nil }
func (s *spaceRepoStub) UpdateChannel(string, dto.ChannelToUpdate) error   { return nil }
func (s *spaceRepoStub) DeleteChannel(string) error                        { return nil }
func (s *spaceRepoStub) CreateSpaceMember(dto.SpaceMemberToCreate) (string, error) {
	return "", nil
}
func (s *spaceRepoStub) DeleteSpaceMember(string) error             { return nil }
func (s *spaceRepoStub) IsSpaceMember(string, string) (bool, error) { return false, nil }
func (s *spaceRepoStub) GetSpaceMemberByID(string) (dto.SpaceMember, error) {
	return dto.SpaceMember{}, nil
}
func (s *spaceRepoStub) DeleteSpaceMemberBySpaceUser(string, string) error { return nil }
func (s *spaceRepoStub) ListSpaceMembers(string) ([]dto.SpaceMemberWithUser, error) {
	return nil, nil
}
