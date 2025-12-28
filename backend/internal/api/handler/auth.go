package handler

import (
	"errors"
	"net/http"
	"net/url"
	"strings"

	api "zerizeha/internal/api"
	authservice "zerizeha/internal/service/auth"

	"github.com/gofiber/fiber/v2"
)

func (h *Handler) Health(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"status": "ok"})
}

func (h *Handler) GoogleLogin(c *fiber.Ctx) error {
	desktop := strings.EqualFold(c.Query("client"), "desktop")
	state, err := generateState()
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "failed to generate state"})
	}

	prefixedState := state
	if desktop {
		prefixedState = "desktop:" + state
	}

	h.setStateCookie(c, "google", prefixedState)
	return c.Redirect(h.authService.GoogleAuthURL(prefixedState, desktop), http.StatusTemporaryRedirect)
}

func (h *Handler) GoogleCallback(c *fiber.Ctx, params api.GoogleCallbackParams) error {
	isDesktop := strings.EqualFold(c.Query("client"), "desktop") || strings.HasPrefix(params.State, "desktop:")
	if !isDesktop {
		if err := h.verifyStateCookie(c, "google", params.State); err != nil {
			return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
	}

	response, err := h.authService.HandleGoogleCallback(c.UserContext(), params.Code, isDesktop)
	return h.handleAuthResponse(c, response, err, !isDesktop)
}

func (h *Handler) GithubLogin(c *fiber.Ctx) error {
	state, err := generateState()
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "failed to generate state"})
	}

	h.setStateCookie(c, "github", state)
	return c.Redirect(h.authService.GithubAuthURL(state), http.StatusTemporaryRedirect)
}

func (h *Handler) GithubCallback(c *fiber.Ctx, params api.GithubCallbackParams) error {
	if err := h.verifyStateCookie(c, "github", params.State); err != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	response, err := h.authService.HandleGithubCallback(c.UserContext(), params.Code)
	return h.handleAuthResponse(c, response, err, true)
}

func (h *Handler) YandexLogin(c *fiber.Ctx) error {
	state, err := generateState()
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "failed to generate state"})
	}

	h.setStateCookie(c, "yandex", state)
	url := h.authService.YandexAuthURL(state)
	if url == "" {
		return c.Status(http.StatusNotImplemented).JSON(fiber.Map{"error": "yandex oauth is not configured"})
	}
	return c.Redirect(url, http.StatusTemporaryRedirect)
}

func (h *Handler) YandexCallback(c *fiber.Ctx, params api.YandexCallbackParams) error {
	if err := h.verifyStateCookie(c, "yandex", params.State); err != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	response, err := h.authService.HandleYandexCallback(c.UserContext(), params.Code)
	return h.handleAuthResponse(c, response, err, true)
}

func (h *Handler) Refresh(c *fiber.Ctx) error {
	var req api.RefreshRequest

	_ = c.BodyParser(&req)
	refreshToken := ""
	if req.RefreshToken != nil {
		refreshToken = strings.TrimSpace(*req.RefreshToken)
	}
	if refreshToken == "" {
		refreshToken = strings.TrimSpace(c.Cookies("refresh_token"))
	}
	if refreshToken == "" {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "refresh_token is required"})
	}

	response, err := h.authService.Refresh(c.UserContext(), refreshToken)
	return h.handleAuthResponse(c, response, err, false)
}

func (h *Handler) handleAuthResponse(c *fiber.Ctx, response authservice.TokenResponse, err error, shouldRedirect bool) error {
	if err == nil {
		h.setAuthCookies(c, response)

		if shouldRedirect {
			target := strings.TrimRight(h.cfg.OAuthConfig().FrontendBase, "/")
			if target != "" {
				return c.Redirect(target+"/spaces", http.StatusTemporaryRedirect)
			}
		}

		return c.JSON(response)
	}

	switch {
	case errors.Is(err, authservice.ErrEmailRequired):
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, authservice.ErrOAuthExchange):
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, authservice.ErrUserInfoFetch):
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, authservice.ErrUserInfoDecode):
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, authservice.ErrInvalidRefreshToken):
		return c.Status(http.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}
}

func parseDomain(raw string) string {
	parsed, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return parsed.Hostname()
}
