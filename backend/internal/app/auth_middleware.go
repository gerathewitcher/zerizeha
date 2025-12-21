package app

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"

	api "zerizeha/internal/api"
	apihandler "zerizeha/internal/api/handler"
	"zerizeha/internal/config"
)

func authMiddleware(cfg config.Config) fiber.Handler {
	secret := []byte(cfg.OAuthConfig().JWTSecret)

	return func(c *fiber.Ctx) error {
		path := c.Path()
		if !requiresAuth(path) {
			return c.Next()
		}

		tokenStr := bearerToken(c)
		if tokenStr == "" {
			tokenStr = c.Cookies("access_token")
		}
		if tokenStr == "" {
			return c.Status(http.StatusUnauthorized).JSON(api.ErrorMap{"error": "missing token"})
		}

		claims := &jwt.RegisteredClaims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (interface{}, error) {
			if token.Method != jwt.SigningMethodHS256 {
				return nil, errors.New("unexpected signing method")
			}
			return secret, nil
		})
		if err != nil || !token.Valid {
			return c.Status(http.StatusUnauthorized).JSON(api.ErrorMap{"error": "invalid token"})
		}

		if !hasAudience(claims.Audience, "access") || claims.Subject == "" {
			return c.Status(http.StatusUnauthorized).JSON(api.ErrorMap{"error": "invalid token"})
		}

		c.Locals(apihandler.UserIDLocalKey, claims.Subject)
		return c.Next()
	}
}

func requiresAuth(path string) bool {
	return strings.HasPrefix(path, "/api/spaces") ||
		strings.HasPrefix(path, "/api/channels") ||
		strings.HasPrefix(path, "/api/space-members")
}

func bearerToken(c *fiber.Ctx) string {
	authHeader := c.Get("Authorization")
	if authHeader == "" {
		return ""
	}

	const prefix = "Bearer "
	if !strings.HasPrefix(authHeader, prefix) {
		return ""
	}

	return strings.TrimSpace(strings.TrimPrefix(authHeader, prefix))
}

func hasAudience(audience jwt.ClaimStrings, value string) bool {
	for _, item := range audience {
		if item == value {
			return true
		}
	}
	return false
}
