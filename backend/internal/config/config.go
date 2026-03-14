package config

import (
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

func Load(path string) error {

	err := godotenv.Load(path)

	if err != nil && !os.IsNotExist(err) {
		return err
	}

	return nil
}

const (
	serverPortEnvName            = "APP_PORT"
	pgDSNEnvName                 = "PG_DSN"
	jwtSecretEnvName             = "JWT_SECRET"
	googleClientIDEnvName        = "GOOGLE_CLIENT_ID"
	googleClientSecretEnvName    = "GOOGLE_CLIENT_SECRET"
	googleDesktopIDEnvName       = "GOOGLE_DESKTOP_CLIENT_ID"
	googleDesktopSecretEnvName   = "GOOGLE_DESKTOP_CLIENT_SECRET"
	googleDesktopRedirectEnvName = "GOOGLE_DESKTOP_REDIRECT"
	githubClientIDEnvName        = "GITHUB_CLIENT_ID"
	githubClientSecretEnvName    = "GITHUB_CLIENT_SECRET"
	yandexClientIDEnvName        = "YANDEX_CLIENT_ID"
	yandexClientSecretEnvName    = "YANDEX_CLIENT_SECRET"
	oauthRedirectBaseEnvName     = "OAUTH_REDIRECT_BASE"
	frontendBaseEnvName          = "FRONTEND_BASE"
	accessTokenTTLMinutesEnvName = "ACCESS_TOKEN_TTL_MIN"
	refreshTokenTTLHoursEnvName  = "REFRESH_TOKEN_TTL_HOURS"
	adminEmailsEnvName           = "ADMIN_EMAILS"
	redisAddrEnvName             = "REDIS_ADDR"
	voicePresenceTTLSecEnvName   = "VOICE_PRESENCE_TTL_SEC"
	chatMessageCleanupTTLEnvName = "CHAT_MESSAGE_CLEANUP_TTL"
	janusWSURLEnvName            = "JANUS_WS_URL"
)

type Config interface {
	ServerAdress() string
	PGConfig() PgConfig
	OAuthConfig() OAuthConfig
	AdminEmails() []string
	RedisConfig() RedisConfig
	VoicePresenceTTLSeconds() int
	ChatMessageCleanupTTL() time.Duration
	JanusWSURL() string
}

type ServerConfig struct {
	Port string
}

func (cfg *ServerConfig) Address() string {
	return net.JoinHostPort("0.0.0.0", cfg.Port)
}

type RedisConfig struct {
	Address string `mapstructure:"address"`
	DB      int    `mapstructure:"db"`
}

type PgConfig struct {
	dsn string `mapstructure:"dsn"`
}

func (cfg PgConfig) DSN() string {
	return cfg.dsn
}

type config struct {
	server ServerConfig
	redis  RedisConfig

	pgconfig PgConfig
	oauth    OAuthConfig
	admins   []string
	voiceTTL int
	chatTTL  time.Duration
	janusWS  string
}

type OAuthConfig struct {
	GoogleClientID        string
	GoogleClientSecret    string
	GoogleDesktopID       string
	GoogleDesktopSecret   string
	GoogleDesktopRedirect string
	GithubClientID        string
	GithubClientSecret    string
	YandexClientID        string
	YandexClientSecret    string
	RedirectBase          string
	FrontendBase          string
	JWTSecret             string
	AccessTokenTTLMin     int
	RefreshTokenTTLHours  int
}

func NewConfig() (Config, error) {
	vars := map[string]string{}
	errors := []string{}

	vars[serverPortEnvName] = os.Getenv(serverPortEnvName)
	vars[pgDSNEnvName] = os.Getenv(pgDSNEnvName)
	vars[jwtSecretEnvName] = os.Getenv(jwtSecretEnvName)
	vars[googleClientIDEnvName] = os.Getenv(googleClientIDEnvName)
	vars[googleClientSecretEnvName] = os.Getenv(googleClientSecretEnvName)
	googleDesktopID := os.Getenv(googleDesktopIDEnvName)
	googleDesktopSecret := os.Getenv(googleDesktopSecretEnvName)
	googleDesktopRedirect := os.Getenv(googleDesktopRedirectEnvName)
	vars[githubClientIDEnvName] = os.Getenv(githubClientIDEnvName)
	vars[githubClientSecretEnvName] = os.Getenv(githubClientSecretEnvName)
	vars[oauthRedirectBaseEnvName] = os.Getenv(oauthRedirectBaseEnvName)
	vars[frontendBaseEnvName] = os.Getenv(frontendBaseEnvName)
	vars[redisAddrEnvName] = os.Getenv(redisAddrEnvName)
	janusWSURL := os.Getenv(janusWSURLEnvName)
	yandexClientID := os.Getenv(yandexClientIDEnvName)
	yandexClientSecret := os.Getenv(yandexClientSecretEnvName)

	for k, v := range vars {
		if len(v) == 0 {
			errors = append(errors, k)
		}
	}

	accessTokenTTLMin := 15
	if value := os.Getenv(accessTokenTTLMinutesEnvName); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil {
			accessTokenTTLMin = parsed
		}
	}

	refreshTokenTTLHours := 720
	if value := os.Getenv(refreshTokenTTLHoursEnvName); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil {
			refreshTokenTTLHours = parsed
		}
	}

	if len(errors) > 0 {
		return nil, fmt.Errorf("the following env variables are not set:\n%s", strings.Join(errors, ",\n"))
	}

	admins := parseAdminEmails(os.Getenv(adminEmailsEnvName))

	voiceTTL := 45
	if value := os.Getenv(voicePresenceTTLSecEnvName); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil && parsed > 0 {
			voiceTTL = parsed
		}
	}

	chatTTL := 72 * time.Hour
	if value := strings.TrimSpace(os.Getenv(chatMessageCleanupTTLEnvName)); value != "" {
		if parsed, err := time.ParseDuration(value); err == nil && parsed > 0 {
			chatTTL = parsed
		}
	}

	config := &config{
		server: ServerConfig{
			Port: vars[serverPortEnvName],
		},
		redis: RedisConfig{
			Address: vars[redisAddrEnvName],
		},
		pgconfig: PgConfig{
			dsn: vars[pgDSNEnvName],
		},
		oauth: OAuthConfig{
			GoogleClientID:        vars[googleClientIDEnvName],
			GoogleClientSecret:    vars[googleClientSecretEnvName],
			GoogleDesktopID:       googleDesktopID,
			GoogleDesktopSecret:   googleDesktopSecret,
			GoogleDesktopRedirect: googleDesktopRedirect,
			GithubClientID:        vars[githubClientIDEnvName],
			GithubClientSecret:    vars[githubClientSecretEnvName],
			YandexClientID:        yandexClientID,
			YandexClientSecret:    yandexClientSecret,
			RedirectBase:          vars[oauthRedirectBaseEnvName],
			FrontendBase:          vars[frontendBaseEnvName],
			JWTSecret:             vars[jwtSecretEnvName],
			AccessTokenTTLMin:     accessTokenTTLMin,
			RefreshTokenTTLHours:  refreshTokenTTLHours,
		},
		admins:   admins,
		voiceTTL: voiceTTL,
		chatTTL:  chatTTL,
		janusWS:  janusWSURL,
	}
	return config, nil
}

func (c *config) RedisConfig() RedisConfig {
	return c.redis
}

func (c *config) ServerAdress() string {
	return c.server.Address()
}

func (c *config) PGConfig() PgConfig {
	return c.pgconfig
}

func (c *config) OAuthConfig() OAuthConfig {
	return c.oauth
}

func (c *config) AdminEmails() []string {
	return append([]string(nil), c.admins...)
}

func (c *config) VoicePresenceTTLSeconds() int {
	return c.voiceTTL
}

func (c *config) ChatMessageCleanupTTL() time.Duration {
	return c.chatTTL
}

func (c *config) JanusWSURL() string {
	return c.janusWS
}

func parseAdminEmails(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}

	parts := strings.Split(raw, ",")
	result := make([]string, 0, len(parts))
	seen := map[string]struct{}{}
	for _, part := range parts {
		email := strings.TrimSpace(part)
		if email == "" {
			continue
		}
		key := strings.ToLower(email)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, email)
	}
	return result
}
