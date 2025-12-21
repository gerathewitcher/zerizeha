package handler

import (
	"net/http"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"

	api "zerizeha/internal/api"
	"zerizeha/internal/dto"
)

func (h *Handler) ListChannelsBySpace(c *fiber.Ctx, id string) error {
	if _, err := h.space.GetSpaceByID(id); err != nil {
		if err == pgx.ErrNoRows {
			return c.Status(http.StatusNotFound).JSON(api.ErrorMap{"error": "not found"})
		}
		return writeError(c, err)
	}

	channels, err := h.space.ListChannelsBySpace(id)
	if err != nil {
		return writeError(c, err)
	}

	result := make([]api.Channel, 0, len(channels))
	for _, channel := range channels {
		result = append(result, api.Channel{
			Id:          channel.ID,
			AuthorId:    channel.AuthorID,
			SpaceId:     channel.SpaceID,
			Name:        channel.Name,
			ChannelType: api.ChannelChannelType(channel.ChannelType),
			CreatedAt:   channel.CreatedAt,
			UpdatedAt:   channel.UpdatedAt,
		})
	}

	return c.JSON(result)
}

func (h *Handler) CreateChannel(c *fiber.Ctx) error {
	var body api.CreateChannelJSONRequestBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(http.StatusBadRequest).JSON(api.ErrorMap{"error": "invalid request body"})
	}

	userID, ok := c.Locals(UserIDLocalKey).(string)
	if !ok || userID == "" {
		return c.Status(http.StatusUnauthorized).JSON(api.ErrorMap{"error": "unauthorized"})
	}

	channelID, err := h.space.CreateChannel(dto.ChannelToCreate{
		AuthorID:    userID,
		SpaceID:     body.SpaceId,
		Name:        body.Name,
		ChannelType: string(body.ChannelType),
	})
	if err != nil {
		return writeError(c, err)
	}

	return c.JSON(api.IdResponse{Id: channelID})
}

func (h *Handler) GetChannelByID(c *fiber.Ctx, id string) error {
	channel, err := h.space.GetChannelByID(id)
	if err != nil {
		return writeError(c, err)
	}

	return c.JSON(api.Channel{
		Id:          channel.ID,
		AuthorId:    channel.AuthorID,
		SpaceId:     channel.SpaceID,
		Name:        channel.Name,
		ChannelType: api.ChannelChannelType(channel.ChannelType),
		CreatedAt:   channel.CreatedAt,
		UpdatedAt:   channel.UpdatedAt,
	})
}

func (h *Handler) UpdateChannel(c *fiber.Ctx, id string) error {
	var body api.UpdateChannelJSONRequestBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(http.StatusBadRequest).JSON(api.ErrorMap{"error": "invalid request body"})
	}

	if err := h.space.UpdateChannel(id, dto.ChannelToUpdate{Name: body.Name}); err != nil {
		return writeError(c, err)
	}

	return c.SendStatus(http.StatusNoContent)
}

func (h *Handler) DeleteChannel(c *fiber.Ctx, id string) error {
	if err := h.space.DeleteChannel(id); err != nil {
		return writeError(c, err)
	}
	return c.SendStatus(http.StatusNoContent)
}
