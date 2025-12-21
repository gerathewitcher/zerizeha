package repository

import "zerizeha/internal/dto"

type UserRepository interface {
	CreateUser(user dto.UserToCreate) (userID string, err error)
	GetUserByID(id string) (dto.User, error)
	GetUserByEmail(email string) (dto.User, error)
}

type SpaceRepository interface {
	CreateSpace(space dto.SpaceToCreate) (spaceID string, err error)
	ListSpaces() ([]dto.Space, error)
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
}
