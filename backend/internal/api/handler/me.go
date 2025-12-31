package handler

import (
	"net/http"
	"strings"

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

func (h *Handler) UpdateMe(c *fiber.Ctx) error {
	user, ok := c.Locals(UserLocalKey).(dto.User)
	if !ok || user.ID == "" {
		return c.Status(http.StatusUnauthorized).JSON(api.ErrorMap{"error": "unauthorized"})
	}

	var body api.UpdateMeJSONRequestBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(http.StatusBadRequest).JSON(api.ErrorMap{"error": "invalid_body"})
	}

	username := strings.TrimSpace(body.Username)
	if username == "" {
		return c.Status(http.StatusBadRequest).JSON(api.ErrorMap{"error": "username_required"})
	}

	update := dto.UserToUpdate{Username: &username}
	if err := h.user.UpdateUserInfo(user.ID, update); err != nil {
		return c.Status(http.StatusInternalServerError).JSON(api.ErrorMap{"error": "update_failed"})
	}

	updated, err := h.user.GetUserByID(user.ID)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(api.ErrorMap{"error": "fetch_failed"})
	}

	id := updated.ID
	email := openapi_types.Email(updated.Email)
	updatedUsername := updated.Username
	confirmed := updated.Confirmed
	isAdmin := updated.IsAdmin
	createdAt := updated.CreatedAt

	return c.JSON(api.User{
		Id:          &id,
		Email:       &email,
		Username:    &updatedUsername,
		Confirmed:   &confirmed,
		ConfirmedAt: updated.ConfirmedAt,
		ConfirmedBy: updated.ConfirmedBy,
		IsAdmin:     &isAdmin,
		CreatedAt:   &createdAt,
	})
}
