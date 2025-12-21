package config

import (
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

func Load(path string) error {

	err := godotenv.Load(path)

	if err != nil {
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
	githubClientIDEnvName        = "GITHUB_CLIENT_ID"
	githubClientSecretEnvName    = "GITHUB_CLIENT_SECRET"
	oauthRedirectBaseEnvName     = "OAUTH_REDIRECT_BASE"
	frontendBaseEnvName          = "FRONTEND_BASE"
	accessTokenTTLMinutesEnvName = "ACCESS_TOKEN_TTL_MIN"
	refreshTokenTTLHoursEnvName  = "REFRESH_TOKEN_TTL_HOURS"
)

type Config interface {
	ServerAdress() string
	PGConfig() PgConfig
	OAuthConfig() OAuthConfig
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
}

type OAuthConfig struct {
	GoogleClientID       string
	GoogleClientSecret   string
	GithubClientID       string
	GithubClientSecret   string
	RedirectBase         string
	FrontendBase         string
	JWTSecret            string
	AccessTokenTTLMin    int
	RefreshTokenTTLHours int
}

func NewConfig() (Config, error) {
	vars := map[string]string{}
	errors := []string{}

	vars[serverPortEnvName] = os.Getenv(serverPortEnvName)
	vars[pgDSNEnvName] = os.Getenv(pgDSNEnvName)
	vars[jwtSecretEnvName] = os.Getenv(jwtSecretEnvName)
	vars[googleClientIDEnvName] = os.Getenv(googleClientIDEnvName)
	vars[googleClientSecretEnvName] = os.Getenv(googleClientSecretEnvName)
	vars[githubClientIDEnvName] = os.Getenv(githubClientIDEnvName)
	vars[githubClientSecretEnvName] = os.Getenv(githubClientSecretEnvName)
	vars[oauthRedirectBaseEnvName] = os.Getenv(oauthRedirectBaseEnvName)
	vars[frontendBaseEnvName] = os.Getenv(frontendBaseEnvName)

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

	config := &config{
		server: ServerConfig{
			Port: vars[serverPortEnvName],
		},
		pgconfig: PgConfig{
			dsn: vars[pgDSNEnvName],
		},
		oauth: OAuthConfig{
			GoogleClientID:       vars[googleClientIDEnvName],
			GoogleClientSecret:   vars[googleClientSecretEnvName],
			GithubClientID:       vars[githubClientIDEnvName],
			GithubClientSecret:   vars[githubClientSecretEnvName],
			RedirectBase:         vars[oauthRedirectBaseEnvName],
			FrontendBase:         vars[frontendBaseEnvName],
			JWTSecret:            vars[jwtSecretEnvName],
			AccessTokenTTLMin:    accessTokenTTLMin,
			RefreshTokenTTLHours: refreshTokenTTLHours,
		},
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
