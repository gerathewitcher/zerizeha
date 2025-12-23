package handler

import (
	"net/http"

	"github.com/gofiber/fiber/v2"
	openapi_types "github.com/oapi-codegen/runtime/types"

	api "zerizeha/internal/api"
	"zerizeha/internal/dto"
)

func (h *Handler) GetMe(c *fiber.Ctx) error {
	user, ok := c.Locals(UserLocalKey).(dto.User)
	if !ok || user.ID == "" {
		return c.Status(http.StatusUnauthorized).JSON(api.ErrorMap{"error": "unauthorized"})
	}

	id := user.ID
	email := openapi_types.Email(user.Email)
	username := user.Username
	confirmed := user.Confirmed
	isAdmin := user.IsAdmin
	createdAt := user.CreatedAt

	return c.JSON(api.User{
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
