package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"zerizeha/internal/config"
	"zerizeha/internal/dto"
	"zerizeha/internal/service"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/github"
	"golang.org/x/oauth2/google"
)

var (
	ErrEmailRequired       = errors.New("email is required")
	ErrOAuthExchange       = errors.New("failed to exchange code")
	ErrUserInfoFetch       = errors.New("failed to fetch user info")
	ErrUserInfoDecode      = errors.New("failed to decode user info")
	ErrInvalidRefreshToken = errors.New("invalid refresh token")
)

type Service interface {
	GoogleAuthURL(state string, desktop bool) string
	GithubAuthURL(state string) string
	YandexAuthURL(state string) string
	HandleGoogleCallback(ctx context.Context, code string, desktop bool) (TokenResponse, error)
	HandleGithubCallback(ctx context.Context, code string) (TokenResponse, error)
	HandleYandexCallback(ctx context.Context, code string) (TokenResponse, error)
	Refresh(ctx context.Context, refreshToken string) (TokenResponse, error)
}

type serviceImpl struct {
	userService service.UserService
	cfg         config.Config
}

type TokenResponse struct {
	AccessToken  string    `json:"access_token"`
	RefreshToken string    `json:"refresh_token"`
	TokenType    string    `json:"token_type"`
	ExpiresIn    int64     `json:"expires_in"`
	User         *dto.User `json:"user,omitempty"`
}

type tokenPair struct {
	AccessToken  string
	RefreshToken string
	ExpiresIn    int64
}

type googleUserInfo struct {
	Email         string `json:"email"`
	Name          string `json:"name"`
	VerifiedEmail bool   `json:"verified_email"`
}

type githubUserInfo struct {
	Login string `json:"login"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

type githubEmail struct {
	Email    string `json:"email"`
	Primary  bool   `json:"primary"`
	Verified bool   `json:"verified"`
}

type yandexUserInfo struct {
	Login        string   `json:"login"`
	DisplayName  string   `json:"display_name"`
	DefaultEmail string   `json:"default_email"`
	Emails       []string `json:"emails"`
}

func NewService(userService service.UserService, cfg config.Config) Service {
	return &serviceImpl{userService: userService, cfg: cfg}
}

func (s *serviceImpl) GoogleAuthURL(state string, desktop bool) string {
	return s.googleOAuthConfig(desktop).AuthCodeURL(
		state,
		oauth2.AccessTypeOffline,
		oauth2.SetAuthURLParam("prompt", "consent"),
	)
}

func (s *serviceImpl) GithubAuthURL(state string) string {
	return s.githubOAuthConfig().AuthCodeURL(
		state,
		oauth2.SetAuthURLParam("allow_signup", "true"),
	)
}

func (s *serviceImpl) YandexAuthURL(state string) string {
	cfg := s.yandexOAuthConfig()
	if cfg == nil {
		return ""
	}
	return cfg.AuthCodeURL(state)
}

func (s *serviceImpl) HandleGoogleCallback(ctx context.Context, code string, desktop bool) (TokenResponse, error) {
	client, err := s.exchangeOAuthCode(ctx, s.googleOAuthConfig(desktop), code)
	if err != nil {
		return TokenResponse{}, err
	}

	resp, err := client.Get("https://www.googleapis.com/oauth2/v2/userinfo")
	if err != nil {
		return TokenResponse{}, ErrUserInfoFetch
	}
	defer resp.Body.Close()

	var info googleUserInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return TokenResponse{}, ErrUserInfoDecode
	}

	if info.Email == "" {
		return TokenResponse{}, ErrEmailRequired
	}

	username := deriveUsername(info.Name, info.Email, "")
	user, err := s.findOrCreateUser(info.Email, username)
	if err != nil {
		return TokenResponse{}, err
	}

	return s.issueTokenResponse(user)
}

func (s *serviceImpl) HandleGithubCallback(ctx context.Context, code string) (TokenResponse, error) {
	client, err := s.exchangeOAuthCode(ctx, s.githubOAuthConfig(), code)
	if err != nil {
		return TokenResponse{}, err
	}

	userInfo, err := s.fetchGithubUser(ctx, client)
	if err != nil {
		return TokenResponse{}, err
	}

	if userInfo.Email == "" {
		return TokenResponse{}, ErrEmailRequired
	}

	username := deriveUsername(userInfo.Name, userInfo.Email, userInfo.Login)
	user, err := s.findOrCreateUser(userInfo.Email, username)
	if err != nil {
		return TokenResponse{}, err
	}

	return s.issueTokenResponse(user)
}

func (s *serviceImpl) HandleYandexCallback(ctx context.Context, code string) (TokenResponse, error) {
	cfg := s.yandexOAuthConfig()
	if cfg == nil {
		return TokenResponse{}, ErrOAuthExchange
	}

	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	token, err := cfg.Exchange(ctx, code)
	if err != nil {
		return TokenResponse{}, ErrOAuthExchange
	}
	if strings.TrimSpace(token.AccessToken) == "" {
		return TokenResponse{}, ErrOAuthExchange
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://login.yandex.ru/info?format=json", nil)
	if err != nil {
		return TokenResponse{}, ErrUserInfoFetch
	}
	// Yandex expects "OAuth <token>" (not "Bearer").
	req.Header.Set("Authorization", "OAuth "+token.AccessToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return TokenResponse{}, ErrUserInfoFetch
	}
	defer resp.Body.Close()

	var info yandexUserInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return TokenResponse{}, ErrUserInfoDecode
	}

	email := strings.TrimSpace(info.DefaultEmail)
	if email == "" && len(info.Emails) > 0 {
		email = strings.TrimSpace(info.Emails[0])
	}
	if email == "" {
		return TokenResponse{}, ErrEmailRequired
	}

	username := deriveUsername(info.DisplayName, email, info.Login)
	user, err := s.findOrCreateUser(email, username)
	if err != nil {
		return TokenResponse{}, err
	}

	return s.issueTokenResponse(user)
}

func (s *serviceImpl) Refresh(ctx context.Context, refreshToken string) (TokenResponse, error) {
	userID, err := s.parseRefreshToken(refreshToken)
	if err != nil {
		return TokenResponse{}, ErrInvalidRefreshToken
	}

	response, err := s.issueTokenResponse(dto.User{ID: userID})
	if err != nil {
		return TokenResponse{}, err
	}

	response.User = nil
	return response, nil
}

func (s *serviceImpl) exchangeOAuthCode(ctx context.Context, cfg *oauth2.Config, code string) (*http.Client, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	token, err := cfg.Exchange(ctx, code)
	if err != nil {
		return nil, ErrOAuthExchange
	}

	return cfg.Client(ctx, token), nil
}

func (s *serviceImpl) issueTokenResponse(user dto.User) (TokenResponse, error) {
	pair, err := s.issueTokenPair(user.ID)
	if err != nil {
		return TokenResponse{}, err
	}

	return TokenResponse{
		AccessToken:  pair.AccessToken,
		RefreshToken: pair.RefreshToken,
		TokenType:    "Bearer",
		ExpiresIn:    pair.ExpiresIn,
		User:         &user,
	}, nil
}

func (s *serviceImpl) issueTokenPair(userID string) (tokenPair, error) {
	if userID == "" {
		return tokenPair{}, errors.New("user id is required")
	}

	oauthCfg := s.cfg.OAuthConfig()
	accessTTL := time.Duration(oauthCfg.AccessTokenTTLMin) * time.Minute
	refreshTTL := time.Duration(oauthCfg.RefreshTokenTTLHours) * time.Hour

	accessToken, err := s.signToken(userID, accessTTL, "access")
	if err != nil {
		return tokenPair{}, err
	}

	refreshToken, err := s.signToken(userID, refreshTTL, "refresh")
	if err != nil {
		return tokenPair{}, err
	}

	return tokenPair{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    int64(accessTTL.Seconds()),
	}, nil
}

func (s *serviceImpl) signToken(userID string, ttl time.Duration, audience string) (string, error) {
	secret := []byte(s.cfg.OAuthConfig().JWTSecret)
	now := time.Now()
	claims := jwt.RegisteredClaims{
		Subject:   userID,
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		Audience:  []string{audience},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(secret)
}

func (s *serviceImpl) parseRefreshToken(tokenStr string) (string, error) {
	secret := []byte(s.cfg.OAuthConfig().JWTSecret)
	claims := &jwt.RegisteredClaims{}

	token, err := jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (interface{}, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, errors.New("unexpected signing method")
		}
		return secret, nil
	})
	if err != nil || !token.Valid {
		return "", ErrInvalidRefreshToken
	}

	if !hasAudience(claims.Audience, "refresh") {
		return "", ErrInvalidRefreshToken
	}

	if claims.Subject == "" {
		return "", ErrInvalidRefreshToken
	}

	return claims.Subject, nil
}

func (s *serviceImpl) googleOAuthConfig(desktop bool) *oauth2.Config {
	oauthCfg := s.cfg.OAuthConfig()
	if desktop && strings.TrimSpace(oauthCfg.GoogleDesktopID) != "" && strings.TrimSpace(oauthCfg.GoogleDesktopSecret) != "" {
		redirect := strings.TrimSpace(oauthCfg.GoogleDesktopRedirect)
		if redirect == "" {
			redirect = strings.TrimRight(oauthCfg.RedirectBase, "/") + "/api/auth/google/callback"
		}
		return &oauth2.Config{
			ClientID:     oauthCfg.GoogleDesktopID,
			ClientSecret: oauthCfg.GoogleDesktopSecret,
			RedirectURL:  redirect,
			Scopes:       []string{"email", "profile"},
			Endpoint:     google.Endpoint,
		}
	}
	return &oauth2.Config{
		ClientID:     oauthCfg.GoogleClientID,
		ClientSecret: oauthCfg.GoogleClientSecret,
		RedirectURL:  strings.TrimRight(oauthCfg.RedirectBase, "/") + "/api/auth/google/callback",
		Scopes:       []string{"email", "profile"},
		Endpoint:     google.Endpoint,
	}
}

func (s *serviceImpl) githubOAuthConfig() *oauth2.Config {
	oauthCfg := s.cfg.OAuthConfig()
	return &oauth2.Config{
		ClientID:     oauthCfg.GithubClientID,
		ClientSecret: oauthCfg.GithubClientSecret,
		RedirectURL:  strings.TrimRight(oauthCfg.RedirectBase, "/") + "/api/auth/github/callback",
		Scopes:       []string{"read:user", "user:email"},
		Endpoint:     github.Endpoint,
	}
}

func (s *serviceImpl) yandexOAuthConfig() *oauth2.Config {
	oauthCfg := s.cfg.OAuthConfig()
	if strings.TrimSpace(oauthCfg.YandexClientID) == "" || strings.TrimSpace(oauthCfg.YandexClientSecret) == "" {
		return nil
	}

	endpoint := oauth2.Endpoint{
		AuthURL:  "https://oauth.yandex.com/authorize",
		TokenURL: "https://oauth.yandex.com/token",
	}

	return &oauth2.Config{
		ClientID:     oauthCfg.YandexClientID,
		ClientSecret: oauthCfg.YandexClientSecret,
		RedirectURL:  strings.TrimRight(oauthCfg.RedirectBase, "/") + "/api/auth/yandex/callback",
		Scopes:       []string{"login:info", "login:email"},
		Endpoint:     endpoint,
	}
}

func (s *serviceImpl) findOrCreateUser(email, username string) (dto.User, error) {
	user, err := s.userService.GetUserByEmail(email)
	if err == nil {
		return user, nil
	}

	if !errors.Is(err, pgx.ErrNoRows) {
		return dto.User{}, err
	}

	userID, err := s.userService.CreateUser(dto.UserToCreate{Username: username, Email: email})
	if err != nil {
		return dto.User{}, err
	}

	user, err = s.userService.GetUserByID(userID)
	if err != nil {
		return dto.User{ID: userID, Username: username, Email: email}, nil
	}

	return user, nil
}

func (s *serviceImpl) fetchGithubUser(ctx context.Context, client *http.Client) (githubUserInfo, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	resp, err := client.Get("https://api.github.com/user")
	if err != nil {
		return githubUserInfo{}, ErrUserInfoFetch
	}
	defer resp.Body.Close()

	var info githubUserInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return githubUserInfo{}, ErrUserInfoDecode
	}

	if info.Email != "" {
		return info, nil
	}

	emails, err := s.fetchGithubEmails(client)
	if err != nil {
		return githubUserInfo{}, err
	}

	info.Email = pickGithubEmail(emails)
	return info, nil
}

func (s *serviceImpl) fetchGithubEmails(client *http.Client) ([]githubEmail, error) {
	resp, err := client.Get("https://api.github.com/user/emails")
	if err != nil {
		return nil, ErrUserInfoFetch
	}
	defer resp.Body.Close()

	var emails []githubEmail
	if err := json.NewDecoder(resp.Body).Decode(&emails); err != nil {
		return nil, ErrUserInfoDecode
	}

	return emails, nil
}

func pickGithubEmail(emails []githubEmail) string {
	for _, email := range emails {
		if email.Primary && email.Verified {
			return email.Email
		}
	}

	for _, email := range emails {
		if email.Primary {
			return email.Email
		}
	}

	if len(emails) > 0 {
		return emails[0].Email
	}

	return ""
}

func deriveUsername(name, email, fallback string) string {
	candidate := strings.TrimSpace(name)
	if candidate != "" {
		return candidate
	}

	candidate = strings.TrimSpace(fallback)
	if candidate != "" {
		return candidate
	}

	parts := strings.Split(email, "@")
	if len(parts) > 0 && parts[0] != "" {
		return parts[0]
	}

	return "user"
}

func hasAudience(audience jwt.ClaimStrings, value string) bool {
	for _, item := range audience {
		if item == value {
			return true
		}
	}
	return false
}
