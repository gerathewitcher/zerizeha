package handler

import (
	"net/http"

	"github.com/gofiber/fiber/v2"
	openapi_types "github.com/oapi-codegen/runtime/types"

	api "zerizeha/internal/api"
	"zerizeha/internal/dto"
)

func (h *Handler) CreateSpaceMember(c *fiber.Ctx) error {
	var body api.CreateSpaceMemberJSONRequestBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(http.StatusBadRequest).JSON(api.ErrorMap{"error": "invalid request body"})
	}

	userID, ok := c.Locals(UserIDLocalKey).(string)
	if !ok || userID == "" {
		return writeHTTPError(c, http.StatusUnauthorized, "unauthorized")
	}

	space, err := h.space.GetSpaceByID(body.SpaceId)
	if err != nil {
		return writeError(c, err)
	}
	if space.AuthorID != userID {
		return writeHTTPError(c, http.StatusForbidden, "forbidden")
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
	userID, ok := c.Locals(UserIDLocalKey).(string)
	if !ok || userID == "" {
		return writeHTTPError(c, http.StatusUnauthorized, "unauthorized")
	}

	member, err := h.space.GetSpaceMemberByID(id)
	if err != nil {
		return writeError(c, err)
	}

	space, err := h.space.GetSpaceByID(member.SpaceID)
	if err != nil {
		return writeError(c, err)
	}
	if space.AuthorID != userID {
		return writeHTTPError(c, http.StatusForbidden, "forbidden")
	}

	if err := h.space.DeleteSpaceMember(id); err != nil {
		return writeError(c, err)
	}
	return c.SendStatus(http.StatusNoContent)
}

func (h *Handler) ListSpaceMembers(c *fiber.Ctx, id string) error {
	userID, ok := c.Locals(UserIDLocalKey).(string)
	if !ok || userID == "" {
		return writeHTTPError(c, http.StatusUnauthorized, "unauthorized")
	}

	space, err := h.space.GetSpaceByID(id)
	if err != nil {
		return writeError(c, err)
	}
	if space.AuthorID != userID {
		return writeHTTPError(c, http.StatusForbidden, "forbidden")
	}

	members, err := h.space.ListSpaceMembers(id)
	if err != nil {
		return writeError(c, err)
	}

	result := make([]api.SpaceMemberView, 0, len(members))
	for _, m := range members {
		memberUserID := m.UserID
		email := openapi_types.Email(m.Email)
		result = append(result, api.SpaceMemberView{
			SpaceMemberId: m.SpaceMemberID,
			SpaceId:       m.SpaceID,
			UserId:        memberUserID,
			Username:      m.Username,
			Email:         &email,
			IsAdmin:       m.IsAdmin,
			CreatedAt:     m.CreatedAt,
		})
	}

	return c.JSON(result)
}

func (h *Handler) RemoveSpaceMember(c *fiber.Ctx, spaceId string, userId string) error {
	userID, ok := c.Locals(UserIDLocalKey).(string)
	if !ok || userID == "" {
		return writeHTTPError(c, http.StatusUnauthorized, "unauthorized")
	}

	space, err := h.space.GetSpaceByID(spaceId)
	if err != nil {
		return writeError(c, err)
	}
	if space.AuthorID != userID {
		return writeHTTPError(c, http.StatusForbidden, "forbidden")
	}

	if err := h.space.DeleteSpaceMemberBySpaceUser(spaceId, userId); err != nil {
		return writeError(c, err)
	}

	return c.SendStatus(http.StatusNoContent)
}
