package auth

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"

	"zerizeha/internal/config"
	"zerizeha/internal/dto"
)

// TestRefreshIssuesNewTokens verifies that a valid refresh token produces a new
// token response without embedding the user payload.
func TestRefreshIssuesNewTokens(t *testing.T) {
	t.Parallel()

	// given
	svc := &serviceImpl{
		cfg: authConfigStub{
			oauth: config.OAuthConfig{
				JWTSecret:            "secret",
				AccessTokenTTLMin:    15,
				RefreshTokenTTLHours: 24,
			},
		},
	}
	pair, err := svc.issueTokenPair("user-1")
	if err != nil {
		t.Fatalf("issueTokenPair() error = %v", err)
	}

	// when
	response, err := svc.Refresh(context.Background(), pair.RefreshToken)

	// then
	if err != nil {
		t.Fatalf("Refresh() error = %v", err)
	}
	if response.User != nil {
		t.Fatalf("Refresh() user = %+v, want nil", response.User)
	}
	if response.AccessToken == "" || response.RefreshToken == "" {
		t.Fatal("Refresh() returned empty token")
	}
	if response.TokenType != "Bearer" {
		t.Fatalf("Refresh() token type = %q, want %q", response.TokenType, "Bearer")
	}
	if response.ExpiresIn != 15*60 {
		t.Fatalf("Refresh() expires in = %d, want %d", response.ExpiresIn, int64(15*60))
	}
}

// TestParseRefreshTokenRejectsAccessToken verifies that access tokens cannot be
// used in the refresh flow.
func TestParseRefreshTokenRejectsAccessToken(t *testing.T) {
	t.Parallel()

	// given
	svc := &serviceImpl{
		cfg: authConfigStub{
			oauth: config.OAuthConfig{
				JWTSecret:            "secret",
				AccessTokenTTLMin:    15,
				RefreshTokenTTLHours: 24,
			},
		},
	}
	accessToken, err := svc.signToken("user-1", time.Minute, "access")
	if err != nil {
		t.Fatalf("signToken() error = %v", err)
	}

	// when
	userID, err := svc.parseRefreshToken(accessToken)

	// then
	if !errors.Is(err, ErrInvalidRefreshToken) {
		t.Fatalf("parseRefreshToken() error = %v, want %v", err, ErrInvalidRefreshToken)
	}
	if userID != "" {
		t.Fatalf("parseRefreshToken() userID = %q, want empty", userID)
	}
}

// TestFindOrCreateUserCreatesAndFallsBackToCreatedPayload verifies that the
// service creates a missing user and returns the created identity even if the
// follow-up lookup fails.
func TestFindOrCreateUserCreatesAndFallsBackToCreatedPayload(t *testing.T) {
	t.Parallel()

	// given
	userService := &authUserServiceStub{
		getByEmailErr: pgx.ErrNoRows,
		createUserID:  "user-1",
		getByIDErr:    errors.New("lookup failed"),
	}
	svc := &serviceImpl{userService: userService}

	// when
	user, err := svc.findOrCreateUser("gera@example.com", "gera")

	// then
	if err != nil {
		t.Fatalf("findOrCreateUser() error = %v", err)
	}
	if user.ID != "user-1" || user.Username != "gera" || user.Email != "gera@example.com" {
		t.Fatalf("findOrCreateUser() user = %+v", user)
	}
	if userService.createdUser.Username != "gera" || userService.createdUser.Email != "gera@example.com" {
		t.Fatalf("findOrCreateUser() created user = %+v", userService.createdUser)
	}
}

// TestDeriveUsernamePrefersNameThenFallbackThenEmail verifies the username
// derivation order used by OAuth providers.
func TestDeriveUsernamePrefersNameThenFallbackThenEmail(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name     string
		fullName string
		email    string
		fallback string
		want     string
	}{
		{
			name:     "uses full name first",
			fullName: "Gera",
			email:    "gera@example.com",
			fallback: "gera_login",
			want:     "Gera",
		},
		{
			name:     "uses fallback when name is empty",
			fullName: "",
			email:    "gera@example.com",
			fallback: "gera_login",
			want:     "gera_login",
		},
		{
			name:     "uses email local part last",
			fullName: "",
			email:    "gera@example.com",
			fallback: "",
			want:     "gera",
		},
		{
			name:     "falls back to generic user",
			fullName: "",
			email:    "",
			fallback: "",
			want:     "user",
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			// when
			got := deriveUsername(tc.fullName, tc.email, tc.fallback)

			// then
			if got != tc.want {
				t.Fatalf("deriveUsername() = %q, want %q", got, tc.want)
			}
		})
	}
}

// TestHasAudience verifies that token audience matching is exact.
func TestHasAudience(t *testing.T) {
	t.Parallel()

	// given
	audience := jwt.ClaimStrings{"access", "refresh"}

	// when
	hasRefresh := hasAudience(audience, "refresh")
	hasDesktop := hasAudience(audience, "desktop")

	// then
	if !hasRefresh {
		t.Fatal("hasAudience() = false, want true for refresh")
	}
	if hasDesktop {
		t.Fatal("hasAudience() = true, want false for desktop")
	}
}

type authConfigStub struct {
	oauth config.OAuthConfig
}

func (s authConfigStub) ServerAdress() string                 { return "" }
func (s authConfigStub) PGConfig() config.PgConfig            { return config.PgConfig{} }
func (s authConfigStub) OAuthConfig() config.OAuthConfig      { return s.oauth }
func (s authConfigStub) AdminEmails() []string                { return nil }
func (s authConfigStub) RedisConfig() config.RedisConfig      { return config.RedisConfig{} }
func (s authConfigStub) VoicePresenceTTLSeconds() int         { return 0 }
func (s authConfigStub) ChatMessageCleanupTTL() time.Duration { return 0 }
func (s authConfigStub) JanusWSURL() string                   { return "" }

type authUserServiceStub struct {
	getByEmailUser dto.User
	getByEmailErr  error
	createUserID   string
	createUserErr  error
	createdUser    dto.UserToCreate
	getByIDUser    dto.User
	getByIDErr     error
}

func (s *authUserServiceStub) CreateUser(user dto.UserToCreate) (string, error) {
	s.createdUser = user
	return s.createUserID, s.createUserErr
}
func (s *authUserServiceStub) GetUserByID(string) (dto.User, error) {
	return s.getByIDUser, s.getByIDErr
}
func (s *authUserServiceStub) GetUserByEmail(string) (dto.User, error) {
	return s.getByEmailUser, s.getByEmailErr
}
func (s *authUserServiceStub) ListUsers() ([]dto.User, error)             { return nil, nil }
func (s *authUserServiceStub) GetUsersByIDs([]string) ([]dto.User, error) { return nil, nil }
func (s *authUserServiceStub) SearchUsers(string, int, *dto.UserSearchCursor, bool, *bool) ([]dto.User, *dto.UserSearchCursor, error) {
	return nil, nil, nil
}
func (s *authUserServiceStub) SetUserConfirmed(string, bool, string) error   { return nil }
func (s *authUserServiceStub) UpdateUserInfo(string, dto.UserToUpdate) error { return nil }
func (s *authUserServiceStub) SyncAdminsByEmails([]string) error             { return nil }
