package pg_space_repo

import (
	"zerizeha/internal/dto"
	"zerizeha/pkg/db"
)

func ToSpaceFromRepo(space Space) dto.Space {
	return dto.Space{
		ID:        space.id,
		AuthorID:  space.authorID,
		Name:      space.name,
		CreatedAt: space.createdAt,
		UpdatedAt: db.NullTimeToPtr(space.updatedAt),
	}
}

func ToSpaceMemberFromRepo(spaceMember SpaceMember) dto.SpaceMember {
	return dto.SpaceMember{
		ID:        spaceMember.id,
		SpaceID:   spaceMember.spaceID,
		UserID:    spaceMember.userID,
		CreatedAt: spaceMember.createdAt,
	}
}

func ToChannelFromRepo(channel Channel) dto.Channel {
	return dto.Channel{
		ID:          channel.id,
		AuthorID:    channel.authorID,
		SpaceID:     channel.spaceID,
		Name:        channel.name,
		ChannelType: channel.channelType,
		CreatedAt:   channel.createdAt,
		UpdatedAt:   db.NullTimeToPtr(channel.updatedAt),
	}
}
