package handler

import (
	"errors"
	"net/http"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	api "zerizeha/internal/api"
	spaceservice "zerizeha/internal/service/space"
)

func writeError(c *fiber.Ctx, err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return c.Status(http.StatusNotFound).JSON(api.ErrorMap{"error": "not found"})
	}

	if errors.Is(err, spaceservice.ErrInvalidChannelType) {
		return c.Status(http.StatusBadRequest).JSON(api.ErrorMap{"error": err.Error()})
	}

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23503": // foreign_key_violation
			return c.Status(http.StatusBadRequest).JSON(api.ErrorMap{"error": "invalid reference"})
		case "23505": // unique_violation
			return c.Status(http.StatusBadRequest).JSON(api.ErrorMap{"error": "already exists"})
		}
	}

	return c.Status(http.StatusInternalServerError).JSON(api.ErrorMap{"error": "internal error"})
}
