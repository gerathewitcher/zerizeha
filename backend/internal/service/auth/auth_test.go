package auth

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"

	"zerizeha/internal/config"
	"zerizeha/internal/dto"
	mailservice "zerizeha/internal/service/mail"
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

// TestLoginWithPasswordIssuesTokens verifies email/password auth uses the
// existing user identity and JWT issuing path.
func TestLoginWithPasswordIssuesTokens(t *testing.T) {
	t.Parallel()

	hash, err := bcrypt.GenerateFromPassword([]byte("password-123"), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("GenerateFromPassword() error = %v", err)
	}
	authRepo := &authCredentialRepoStub{
		getPasswordUser: dto.User{ID: "user-1", Email: "gera@example.com", Username: "gera"},
		getPasswordHash: string(hash),
	}
	svc := &serviceImpl{
		authRepo: authRepo,
		cfg: authConfigStub{
			oauth: config.OAuthConfig{
				JWTSecret:            "secret",
				AccessTokenTTLMin:    15,
				RefreshTokenTTLHours: 24,
			},
		},
	}

	response, err := svc.LoginWithPassword(context.Background(), " GERA@example.com ", "password-123")

	if err != nil {
		t.Fatalf("LoginWithPassword() error = %v", err)
	}
	if response.User == nil || response.User.ID != "user-1" {
		t.Fatalf("LoginWithPassword() user = %+v", response.User)
	}
	if response.AccessToken == "" || response.RefreshToken == "" {
		t.Fatal("LoginWithPassword() returned empty tokens")
	}
	if authRepo.getPasswordEmail != "gera@example.com" {
		t.Fatalf("GetPasswordHashByEmail() email = %q", authRepo.getPasswordEmail)
	}
}

// TestRegisterWithPasswordCreatesUserAndSendsConfirmation verifies
// registration creates an email/password identity and sends a confirmation
// link instead of issuing tokens immediately.
func TestRegisterWithPasswordCreatesUserAndSendsConfirmation(t *testing.T) {
	t.Parallel()

	userService := &authUserServiceStub{
		getByEmailErr: pgx.ErrNoRows,
		createUserID:  "user-1",
		getByIDUser: dto.User{
			ID:       "user-1",
			Email:    "gera@example.com",
			Username: "gera",
		},
	}
	authRepo := &authCredentialRepoStub{}
	email := &authMailServiceStub{}
	svc := &serviceImpl{
		userService: userService,
		authRepo:    authRepo,
		email:       email,
		cfg: authConfigStub{
			oauth: config.OAuthConfig{
				JWTSecret:            "secret",
				AccessTokenTTLMin:    15,
				RefreshTokenTTLHours: 24,
				FrontendBase:         "https://app.example.com",
			},
		},
	}

	err := svc.RegisterWithPassword(context.Background(), " GERA@example.com ", "password-123")

	if err != nil {
		t.Fatalf("RegisterWithPassword() error = %v", err)
	}
	if userService.getByEmailValue != "gera@example.com" {
		t.Fatalf("GetUserByEmail() email = %q", userService.getByEmailValue)
	}
	if userService.createdUser.Email != "gera@example.com" || userService.createdUser.Username != "gera" {
		t.Fatalf("CreateUser() user = %+v", userService.createdUser)
	}
	if authRepo.upsertUserID != "user-1" {
		t.Fatalf("UpsertPassword() userID = %q", authRepo.upsertUserID)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(authRepo.upsertHash), []byte("password-123")); err != nil {
		t.Fatalf("UpsertPassword() hash does not match password: %v", err)
	}
	if authRepo.tokenPurpose != "registration_confirm" || authRepo.tokenUserID != "user-1" || authRepo.tokenHash == "" {
		t.Fatalf("CreateEmailToken() userID=%q purpose=%q hash empty=%t", authRepo.tokenUserID, authRepo.tokenPurpose, authRepo.tokenHash == "")
	}
	if email.confirmationTo != "gera@example.com" {
		t.Fatalf("SendEmailConfirmation() to = %q", email.confirmationTo)
	}
	if !strings.Contains(email.confirmationURL, "https://app.example.com/login?confirm_token=") {
		t.Fatalf("SendEmailConfirmation() url = %q", email.confirmationURL)
	}
}

// TestRegisterWithPasswordRejectsExistingEmail verifies registration does not
// overwrite an existing account.
func TestRegisterWithPasswordRejectsExistingEmail(t *testing.T) {
	t.Parallel()

	userService := &authUserServiceStub{
		getByEmailUser: dto.User{ID: "user-1", Email: "gera@example.com"},
	}
	authRepo := &authCredentialRepoStub{}
	svc := &serviceImpl{userService: userService, authRepo: authRepo}

	err := svc.RegisterWithPassword(context.Background(), "gera@example.com", "password-123")

	if !errors.Is(err, ErrEmailAlreadyExists) {
		t.Fatalf("RegisterWithPassword() error = %v, want %v", err, ErrEmailAlreadyExists)
	}
	if userService.createdUser.Email != "" {
		t.Fatalf("CreateUser() user = %+v, want zero value", userService.createdUser)
	}
	if authRepo.upsertUserID != "" {
		t.Fatalf("UpsertPassword() userID = %q, want empty", authRepo.upsertUserID)
	}
}

// TestConfirmRegistrationConsumesTokenAndConfirmsUser verifies email
// confirmation marks the user as confirmed and issues auth tokens.
func TestConfirmRegistrationConsumesTokenAndConfirmsUser(t *testing.T) {
	t.Parallel()

	userService := &authUserServiceStub{}
	authRepo := &authCredentialRepoStub{
		consumeUser: dto.User{ID: "user-1", Email: "gera@example.com", Username: "gera"},
	}
	svc := &serviceImpl{
		userService: userService,
		authRepo:    authRepo,
		cfg: authConfigStub{
			oauth: config.OAuthConfig{
				JWTSecret:            "secret",
				AccessTokenTTLMin:    15,
				RefreshTokenTTLHours: 24,
			},
		},
	}

	response, err := svc.ConfirmRegistration(context.Background(), "token")

	if err != nil {
		t.Fatalf("ConfirmRegistration() error = %v", err)
	}
	if authRepo.consumePurpose != "registration_confirm" {
		t.Fatalf("ConsumeEmailToken() purpose = %q", authRepo.consumePurpose)
	}
	if userService.confirmedID != "user-1" || !userService.confirmedValue || userService.confirmedBy != "user-1" {
		t.Fatalf("SetUserConfirmed() id=%q confirmed=%t by=%q", userService.confirmedID, userService.confirmedValue, userService.confirmedBy)
	}
	if response.User == nil || !response.User.Confirmed {
		t.Fatalf("ConfirmRegistration() user = %+v", response.User)
	}
	if response.AccessToken == "" || response.RefreshToken == "" {
		t.Fatal("ConfirmRegistration() returned empty tokens")
	}
}

// TestRequestPasswordSetupIgnoresMissingUser verifies the endpoint-safe service
// behavior that prevents email enumeration.
func TestRequestPasswordSetupIgnoresMissingUser(t *testing.T) {
	t.Parallel()

	userService := &authUserServiceStub{getByEmailErr: pgx.ErrNoRows}
	svc := &serviceImpl{userService: userService}

	if err := svc.RequestPasswordSetup(context.Background(), "missing@example.com"); err != nil {
		t.Fatalf("RequestPasswordSetup() error = %v", err)
	}
}

// TestConfirmPasswordSetupConsumesTokenAndStoresPassword verifies that setup
// links bind a password to the existing account and issue tokens.
func TestConfirmPasswordSetupConsumesTokenAndStoresPassword(t *testing.T) {
	t.Parallel()

	authRepo := &authCredentialRepoStub{
		consumeUser: dto.User{ID: "user-1", Email: "gera@example.com", Username: "gera"},
	}
	svc := &serviceImpl{
		authRepo: authRepo,
		cfg: authConfigStub{
			oauth: config.OAuthConfig{
				JWTSecret:            "secret",
				AccessTokenTTLMin:    15,
				RefreshTokenTTLHours: 24,
			},
		},
	}

	response, err := svc.ConfirmPasswordSetup(context.Background(), "token", "password-123")

	if err != nil {
		t.Fatalf("ConfirmPasswordSetup() error = %v", err)
	}
	if response.User == nil || response.User.ID != "user-1" {
		t.Fatalf("ConfirmPasswordSetup() user = %+v", response.User)
	}
	if authRepo.upsertUserID != "user-1" || authRepo.upsertHash == "" {
		t.Fatalf("UpsertPassword() userID = %q hash empty = %t", authRepo.upsertUserID, authRepo.upsertHash == "")
	}
	if authRepo.consumePurpose != "password_setup" {
		t.Fatalf("ConsumeEmailToken() purpose = %q", authRepo.consumePurpose)
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
func (s authConfigStub) EmailConfig() config.EmailConfig      { return config.EmailConfig{} }
func (s authConfigStub) AdminEmails() []string                { return nil }
func (s authConfigStub) RedisConfig() config.RedisConfig      { return config.RedisConfig{} }
func (s authConfigStub) VoicePresenceTTLSeconds() int         { return 0 }
func (s authConfigStub) ChatMessageCleanupTTL() time.Duration { return 0 }
func (s authConfigStub) JanusWSURL() string                   { return "" }

type authUserServiceStub struct {
	getByEmailUser  dto.User
	getByEmailErr   error
	getByEmailValue string
	createUserID    string
	createUserErr   error
	createdUser     dto.UserToCreate
	getByIDUser     dto.User
	getByIDErr      error
	confirmedID     string
	confirmedValue  bool
	confirmedBy     string
}

func (s *authUserServiceStub) CreateUser(user dto.UserToCreate) (string, error) {
	s.createdUser = user
	return s.createUserID, s.createUserErr
}
func (s *authUserServiceStub) GetUserByID(string) (dto.User, error) {
	return s.getByIDUser, s.getByIDErr
}
func (s *authUserServiceStub) GetUserByEmail(email string) (dto.User, error) {
	s.getByEmailValue = email
	return s.getByEmailUser, s.getByEmailErr
}
func (s *authUserServiceStub) ListUsers() ([]dto.User, error)             { return nil, nil }
func (s *authUserServiceStub) GetUsersByIDs([]string) ([]dto.User, error) { return nil, nil }
func (s *authUserServiceStub) SearchUsers(string, int, *dto.UserSearchCursor, bool, *bool) ([]dto.User, *dto.UserSearchCursor, error) {
	return nil, nil, nil
}
func (s *authUserServiceStub) SetUserConfirmed(id string, confirmed bool, confirmedBy string) error {
	s.confirmedID = id
	s.confirmedValue = confirmed
	s.confirmedBy = confirmedBy
	return nil
}
func (s *authUserServiceStub) UpdateUserInfo(string, dto.UserToUpdate) error { return nil }
func (s *authUserServiceStub) SyncAdminsByEmails([]string) error             { return nil }

type authMailServiceStub struct {
	confirmationTo  string
	confirmationURL string
	setupTo         string
	setupURL        string
	err             error
}

func (s *authMailServiceStub) Send(context.Context, mailservice.Message) error {
	return s.err
}

func (s *authMailServiceStub) SendPasswordSetup(_ context.Context, to string, setupURL string) error {
	s.setupTo = to
	s.setupURL = setupURL
	return s.err
}

func (s *authMailServiceStub) SendEmailConfirmation(_ context.Context, to string, confirmationURL string) error {
	s.confirmationTo = to
	s.confirmationURL = confirmationURL
	return s.err
}

type authCredentialRepoStub struct {
	getPasswordEmail string
	getPasswordUser  dto.User
	getPasswordHash  string
	getPasswordErr   error
	upsertUserID     string
	upsertHash       string
	upsertErr        error
	tokenUserID      string
	tokenHash        string
	tokenPurpose     string
	tokenExpiresAt   time.Time
	tokenErr         error
	consumeHash      string
	consumePurpose   string
	consumeUser      dto.User
	consumeErr       error
}

func (s *authCredentialRepoStub) UpsertPassword(userID string, passwordHash string) error {
	s.upsertUserID = userID
	s.upsertHash = passwordHash
	return s.upsertErr
}

func (s *authCredentialRepoStub) GetPasswordHashByEmail(email string) (dto.User, string, error) {
	s.getPasswordEmail = email
	return s.getPasswordUser, s.getPasswordHash, s.getPasswordErr
}

func (s *authCredentialRepoStub) CreateEmailToken(userID string, tokenHash string, purpose string, expiresAt time.Time) error {
	s.tokenUserID = userID
	s.tokenHash = tokenHash
	s.tokenPurpose = purpose
	s.tokenExpiresAt = expiresAt
	return s.tokenErr
}

func (s *authCredentialRepoStub) ConsumeEmailToken(tokenHash string, purpose string) (dto.User, error) {
	s.consumeHash = tokenHash
	s.consumePurpose = purpose
	return s.consumeUser, s.consumeErr
}
