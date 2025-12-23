package handler

import (
	"net/http"

	"github.com/gofiber/fiber/v2"

	api "zerizeha/internal/api"
	"zerizeha/internal/dto"
)

func (h *Handler) ListSpaces(c *fiber.Ctx) error {
	userID, ok := c.Locals(UserIDLocalKey).(string)
	if !ok || userID == "" {
		return writeHTTPError(c, http.StatusUnauthorized, "unauthorized")
	}

	spaces, err := h.space.ListSpacesByUser(userID)
	if err != nil {
		return writeError(c, err)
	}

	result := make([]api.Space, 0, len(spaces))
	for _, space := range spaces {
		result = append(result, api.Space{
			Id:        space.ID,
			AuthorId:  space.AuthorID,
			Name:      space.Name,
			CreatedAt: space.CreatedAt,
			UpdatedAt: space.UpdatedAt,
		})
	}

	return c.JSON(result)
}

func (h *Handler) CreateSpace(c *fiber.Ctx) error {
	var body api.CreateSpaceJSONRequestBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(http.StatusBadRequest).JSON(api.ErrorMap{"error": "invalid request body"})
	}

	userID, ok := c.Locals(UserIDLocalKey).(string)
	if !ok || userID == "" {
		return c.Status(http.StatusUnauthorized).JSON(api.ErrorMap{"error": "unauthorized"})
	}

	spaceID, err := h.space.CreateSpace(dto.SpaceToCreate{
		AuthorID: userID,
		Name:     body.Name,
	})
	if err != nil {
		return writeError(c, err)
	}

	return c.JSON(api.IdResponse{Id: spaceID})
}

func (h *Handler) GetSpaceByID(c *fiber.Ctx, id string) error {
	space, err := h.space.GetSpaceByID(id)
	if err != nil {
		return writeError(c, err)
	}

	return c.JSON(api.Space{
		Id:        space.ID,
		AuthorId:  space.AuthorID,
		Name:      space.Name,
		CreatedAt: space.CreatedAt,
		UpdatedAt: space.UpdatedAt,
	})
}

func (h *Handler) UpdateSpace(c *fiber.Ctx, id string) error {
	var body api.UpdateSpaceJSONRequestBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(http.StatusBadRequest).JSON(api.ErrorMap{"error": "invalid request body"})
	}

	if err := h.space.UpdateSpace(id, dto.SpaceToUpdate{Name: body.Name}); err != nil {
		return writeError(c, err)
	}

	return c.SendStatus(http.StatusNoContent)
}

func (h *Handler) DeleteSpace(c *fiber.Ctx, id string) error {
	if err := h.space.DeleteSpace(id); err != nil {
		return writeError(c, err)
	}
	return c.SendStatus(http.StatusNoContent)
}
