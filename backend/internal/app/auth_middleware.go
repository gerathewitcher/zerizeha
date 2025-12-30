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
	"zerizeha/internal/service"
	"zerizeha/pkg/logger"
)

func authMiddleware(cfg config.Config, userService service.UserService) fiber.Handler {
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
			tokenStr = strings.TrimSpace(c.Query("access_token"))
		}
		if tokenStr == "" {
			tokenStr = strings.TrimSpace(c.Query("token"))
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

		user, err := userService.GetUserByID(claims.Subject)
		if err != nil {
			return c.Status(http.StatusUnauthorized).JSON(api.ErrorMap{"error": "invalid token"})
		}

		// Expose user info to handlers.
		c.Locals(apihandler.UserIDLocalKey, claims.Subject)
		c.Locals(apihandler.UserLocalKey, user)

		if strings.HasPrefix(path, "/api/admin") && !user.IsAdmin {
			logger.Info("not allowed to admin panel")
			return c.Status(http.StatusForbidden).JSON(api.ErrorMap{"error": "forbidden"})
		}

		if path != "/api/me" && !user.Confirmed {
			logger.Info("not confirmed")
			return c.Status(http.StatusForbidden).JSON(api.ErrorMap{"error": "user is not confirmed"})
		}

		return c.Next()
	}
}

func requiresAuth(path string) bool {
	return strings.HasPrefix(path, "/api/spaces") ||
		strings.HasPrefix(path, "/api/channels") ||
		strings.HasPrefix(path, "/api/space-members") ||
		strings.HasPrefix(path, "/api/users") ||
		strings.HasPrefix(path, "/api/voice") ||
		strings.HasPrefix(path, "/api/ws") ||
		strings.HasPrefix(path, "/api/admin") ||
		path == "/api/me"
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
