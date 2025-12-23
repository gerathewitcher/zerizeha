package handler

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gofiber/fiber/v2"
	openapi_types "github.com/oapi-codegen/runtime/types"

	api "zerizeha/internal/api"
	"zerizeha/internal/dto"
)

func (h *Handler) SearchUsers(c *fiber.Ctx, params api.SearchUsersParams) error {
	if _, ok := c.Locals(UserIDLocalKey).(string); !ok {
		return writeHTTPError(c, http.StatusUnauthorized, "unauthorized")
	}

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

	users, next, err := h.user.SearchUsers(query, limit, cursor, true, nil)
	if err != nil {
		return writeError(c, err)
	}

	items := make([]api.UserSearchResult, 0, len(users))
	for _, u := range users {
		id := u.ID
		email := openapi_types.Email(u.Email)
		items = append(items, api.UserSearchResult{
			Id:       id,
			Username: u.Username,
			Email:    &email,
			IsAdmin:  u.IsAdmin,
		})
	}

	var nextCursor *string
	if next != nil {
		encoded := encodeUserCursor(*next)
		nextCursor = &encoded
	}

	return c.JSON(api.UserSearchPage{
		Items:      items,
		NextCursor: nextCursor,
	})
}

func encodeUserCursor(cursor dto.UserSearchCursor) string {
	payload, _ := json.Marshal(cursor)
	return base64.RawURLEncoding.EncodeToString(payload)
}

func decodeUserCursor(encoded string) (*dto.UserSearchCursor, error) {
	raw, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return nil, err
	}
	var cursor dto.UserSearchCursor
	if err := json.Unmarshal(raw, &cursor); err != nil {
		return nil, err
	}
	return &cursor, nil
}
