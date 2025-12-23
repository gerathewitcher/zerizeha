package handler

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	api "zerizeha/internal/api"
	spaceservice "zerizeha/internal/service/space"
	"zerizeha/pkg/logger"
)

func writeError(c *fiber.Ctx, err error) error {
	if err == nil {
		return c.SendStatus(http.StatusNoContent)
	}

	if errors.Is(err, pgx.ErrNoRows) {
		logAPIError(c, http.StatusNotFound, err, "not found")
		return c.Status(http.StatusNotFound).JSON(api.ErrorMap{"error": "not found"})
	}

	if errors.Is(err, spaceservice.ErrInvalidChannelType) {
		logAPIError(c, http.StatusBadRequest, err, err.Error())
		return c.Status(http.StatusBadRequest).JSON(api.ErrorMap{"error": err.Error()})
	}

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23503": // foreign_key_violation
			logAPIError(c, http.StatusBadRequest, err, "invalid reference", slog.String("pg_code", pgErr.Code))
			return c.Status(http.StatusBadRequest).JSON(api.ErrorMap{"error": "invalid reference"})
		case "23505": // unique_violation
			logAPIError(c, http.StatusBadRequest, err, "already exists", slog.String("pg_code", pgErr.Code))
			return c.Status(http.StatusBadRequest).JSON(api.ErrorMap{"error": "already exists"})
		}
	}

	logAPIError(c, http.StatusInternalServerError, err, "internal error")
	return c.Status(http.StatusInternalServerError).JSON(api.ErrorMap{"error": "internal error"})
}

func writeHTTPError(c *fiber.Ctx, status int, message string) error {
	logAPIError(c, status, nil, message)
	return c.Status(status).JSON(api.ErrorMap{"error": message})
}

func logAPIError(c *fiber.Ctx, status int, err error, message string, extra ...any) {
	fields := []any{
		slog.Int("status", status),
		slog.String("method", c.Method()),
		slog.String("path", c.Path()),
		slog.String("ip", c.IP()),
	}

	if userID, ok := c.Locals(UserIDLocalKey).(string); ok && userID != "" {
		fields = append(fields, slog.String("user_id", userID))
	}

	if err != nil {
		fields = append(fields, slog.String("err", err.Error()))
	}

	fields = append(fields, extra...)

	if status >= 500 {
		logger.Error(message, fields...)
		return
	}

	logger.Warn(message, fields...)
}
