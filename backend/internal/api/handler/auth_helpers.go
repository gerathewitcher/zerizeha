package handler

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"strings"

	authservice "zerizeha/internal/service/auth"

	"github.com/gofiber/fiber/v2"
)

func generateState() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}

	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func (h *Handler) setStateCookie(c *fiber.Ctx, provider, state string) {
	oauthCfg := h.cfg.OAuthConfig()
	domain := parseDomain(oauthCfg.RedirectBase)
	secure := strings.HasPrefix(strings.ToLower(oauthCfg.RedirectBase), "https")

	c.Cookie(&fiber.Cookie{
		Name:     "oauth_state_" + provider,
		Value:    state,
		HTTPOnly: true,
		Secure:   secure,
		SameSite: "Lax",
		MaxAge:   600,
		Path:     "/api/auth",
		Domain:   domain,
	})
}

func (h *Handler) verifyStateCookie(c *fiber.Ctx, provider, state string) error {
	if state == "" {
		return errors.New("missing state")
	}

	cookieValue := c.Cookies("oauth_state_" + provider)
	if cookieValue == "" {
		return errors.New("state cookie is missing")
	}

	if cookieValue != state {
		return errors.New("state mismatch")
	}

	h.clearStateCookie(c, provider)
	return nil
}

func (h *Handler) clearStateCookie(c *fiber.Ctx, provider string) {
	oauthCfg := h.cfg.OAuthConfig()
	domain := parseDomain(oauthCfg.RedirectBase)
	secure := strings.HasPrefix(strings.ToLower(oauthCfg.RedirectBase), "https")

	c.Cookie(&fiber.Cookie{
		Name:     "oauth_state_" + provider,
		Value:    "",
		HTTPOnly: true,
		Secure:   secure,
		SameSite: "Lax",
		MaxAge:   -1,
		Path:     "/api/auth",
		Domain:   domain,
	})
}

func (h *Handler) setAuthCookies(c *fiber.Ctx, response authservice.TokenResponse) {
	oauthCfg := h.cfg.OAuthConfig()
	domain := parseDomain(oauthCfg.RedirectBase)
	secure := strings.HasPrefix(strings.ToLower(oauthCfg.RedirectBase), "https")
	sameSite := "Lax"

	accessMaxAge := int(response.ExpiresIn)
	if accessMaxAge <= 0 {
		accessMaxAge = oauthCfg.AccessTokenTTLMin * 60
	}

	refreshMaxAge := oauthCfg.RefreshTokenTTLHours * 3600

	if response.AccessToken != "" {
		c.Cookie(&fiber.Cookie{
			Name:     "access_token",
			Value:    response.AccessToken,
			HTTPOnly: true,
			Secure:   secure,
			SameSite: sameSite,
			Path:     "/",
			Domain:   domain,
			MaxAge:   accessMaxAge,
		})
	}

	if response.RefreshToken != "" {
		c.Cookie(&fiber.Cookie{
			Name:     "refresh_token",
			Value:    response.RefreshToken,
			HTTPOnly: true,
			Secure:   secure,
			SameSite: sameSite,
			Path:     "/",
			Domain:   domain,
			MaxAge:   refreshMaxAge,
		})
	}
}

func (h *Handler) clearAuthCookies(c *fiber.Ctx) {
	oauthCfg := h.cfg.OAuthConfig()
	domain := parseDomain(oauthCfg.RedirectBase)
	secure := strings.HasPrefix(strings.ToLower(oauthCfg.RedirectBase), "https")
	sameSite := "Lax"

	clearCookie := func(name string, withDomain bool) {
		cookie := &fiber.Cookie{
			Name:     name,
			Value:    "",
			HTTPOnly: true,
			Secure:   secure,
			SameSite: sameSite,
			Path:     "/",
			MaxAge:   -1,
		}
		if withDomain && domain != "" {
			cookie.Domain = domain
		}
		c.Cookie(cookie)
	}

	// Clear both host-only and domain-scoped cookies to avoid redirect loops in dev.
	clearCookie("access_token", false)
	clearCookie("refresh_token", false)
	clearCookie("access_token", true)
	clearCookie("refresh_token", true)
}
