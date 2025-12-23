package handler

import (
	"net/http"
	"strings"

	"github.com/gofiber/fiber/v2"
	openapi_types "github.com/oapi-codegen/runtime/types"

	api "zerizeha/internal/api"
	"zerizeha/internal/dto"
)

func (h *Handler) ListAdminUsers(c *fiber.Ctx, params api.ListAdminUsersParams) error {
	query := ""
	if params.Query != nil {
		query = strings.TrimSpace(*params.Query)
	}

	limit := 20
	if params.Limit != nil && *params.Limit > 0 && *params.Limit <= 50 {
		limit = *params.Limit
	}

	var cursor *dto.UserSearchCursor
	if params.Cursor != nil && strings.TrimSpace(*params.Cursor) != "" {
		parsed, err := decodeUserCursor(*params.Cursor)
		if err != nil {
			return writeHTTPError(c, http.StatusBadRequest, "invalid cursor")
		}
		cursor = parsed
	}

	confirmedFilter := params.Confirmed

	users, next, err := h.user.SearchUsers(query, limit, cursor, false, confirmedFilter)
	if err != nil {
		return writeError(c, err)
	}

	result := make([]api.User, 0, len(users))
	for _, user := range users {
		id := user.ID
		email := openapi_types.Email(user.Email)
		username := user.Username
		confirmed := user.Confirmed
		isAdmin := user.IsAdmin
		createdAt := user.CreatedAt
		result = append(result, api.User{
			Id:          &id,
			Email:       &email,
			Username:    &username,
			Confirmed:   &confirmed,
			ConfirmedAt: user.ConfirmedAt,
			ConfirmedBy: user.ConfirmedBy,
			IsAdmin:     &isAdmin,
			CreatedAt:   &createdAt,
		})
	}

	var nextCursor *string
	if next != nil {
		encoded := encodeUserCursor(*next)
		nextCursor = &encoded
	}

	return c.JSON(api.AdminUsersPage{Items: result, NextCursor: nextCursor})
}

func (h *Handler) UpdateAdminUser(c *fiber.Ctx, id string) error {
	var body api.UpdateAdminUserJSONRequestBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(http.StatusBadRequest).JSON(api.ErrorMap{"error": "invalid request body"})
	}

	adminID, ok := c.Locals(UserIDLocalKey).(string)
	if !ok || adminID == "" {
		return c.Status(http.StatusUnauthorized).JSON(api.ErrorMap{"error": "unauthorized"})
	}

	if err := h.user.SetUserConfirmed(id, body.Confirmed, adminID); err != nil {
		return writeError(c, err)
	}

	return c.SendStatus(http.StatusNoContent)
}
