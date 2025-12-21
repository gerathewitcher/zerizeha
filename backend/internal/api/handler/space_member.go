package handler

import (
	"net/http"

	"github.com/gofiber/fiber/v2"

	api "zerizeha/internal/api"
	"zerizeha/internal/dto"
)

func (h *Handler) CreateSpaceMember(c *fiber.Ctx) error {
	var body api.CreateSpaceMemberJSONRequestBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(http.StatusBadRequest).JSON(api.ErrorMap{"error": "invalid request body"})
	}

	id, err := h.space.CreateSpaceMember(dto.SpaceMemberToCreate{
		SpaceID: body.SpaceId,
		UserID:  body.UserId,
	})
	if err != nil {
		return writeError(c, err)
	}

	return c.JSON(api.IdResponse{Id: id})
}

func (h *Handler) DeleteSpaceMember(c *fiber.Ctx, id string) error {
	if err := h.space.DeleteSpaceMember(id); err != nil {
		return writeError(c, err)
	}
	return c.SendStatus(http.StatusNoContent)
}
