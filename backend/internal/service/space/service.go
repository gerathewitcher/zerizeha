package space

import (
	"errors"
	"strings"

	"zerizeha/internal/dto"
	"zerizeha/internal/repository"
	"zerizeha/internal/service"
)

var ErrInvalidChannelType = errors.New("invalid channel type")

type serv struct {
	repo repository.SpaceRepository
}

func NewSpaceService(repo repository.SpaceRepository) service.SpaceService {
	return &serv{repo: repo}
}

func (s *serv) CreateSpace(space dto.SpaceToCreate) (string, error) {
	return s.repo.CreateSpace(space)
}

func (s *serv) ListSpaces() ([]dto.Space, error) {
	return s.repo.ListSpaces()
}

func (s *serv) GetSpaceByID(id string) (dto.Space, error) {
	return s.repo.GetSpaceByID(id)
}

func (s *serv) UpdateSpace(id string, space dto.SpaceToUpdate) error {
	return s.repo.UpdateSpace(id, space)
}

func (s *serv) DeleteSpace(id string) error {
	return s.repo.DeleteSpace(id)
}

func (s *serv) CreateChannel(channel dto.ChannelToCreate) (string, error) {
	switch strings.ToLower(channel.ChannelType) {
	case "text", "voice":
		return s.repo.CreateChannel(channel)
	default:
		return "", ErrInvalidChannelType
	}
}

func (s *serv) ListChannelsBySpace(spaceID string) ([]dto.Channel, error) {
	return s.repo.ListChannelsBySpace(spaceID)
}

func (s *serv) GetChannelByID(id string) (dto.Channel, error) {
	return s.repo.GetChannelByID(id)
}

func (s *serv) UpdateChannel(id string, channel dto.ChannelToUpdate) error {
	return s.repo.UpdateChannel(id, channel)
}

func (s *serv) DeleteChannel(id string) error {
	return s.repo.DeleteChannel(id)
}

func (s *serv) CreateSpaceMember(spaceMember dto.SpaceMemberToCreate) (string, error) {
	return s.repo.CreateSpaceMember(spaceMember)
}

func (s *serv) DeleteSpaceMember(id string) error {
	return s.repo.DeleteSpaceMember(id)
}
