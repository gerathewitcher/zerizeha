package app

import (
	"context"
	"log/slog"
	"os"
	"strings"
	"time"
	api "zerizeha/internal/api"
	apihandler "zerizeha/internal/api/handler"
	"zerizeha/internal/config"
	"zerizeha/pkg/closer"
	"zerizeha/pkg/logger"

	"github.com/getkin/kin-openapi/openapi3filter"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	fiberlogger "github.com/gofiber/fiber/v2/middleware/logger"
	oasfiber "github.com/oapi-codegen/fiber-middleware"
)

type App struct {
	serviceProvider *serviceProvider
	fiberApp        *fiber.App
}

func NewApp(ctx context.Context) (*App, error) {
	a := &App{}

	err := a.initDeps(ctx)
	if err != nil {
		return nil, err
	}

	return a, nil
}

func (a *App) initDeps(ctx context.Context) error {
	inits := []func(context.Context) error{
		a.initConfig,
		a.InitLogger,
		a.initServiceProvider,
		a.initAdminSync,
		a.initChatCleanup,
		a.initFiber,
		a.InitHandlers,
	}

	for _, f := range inits {
		err := f(ctx)
		if err != nil {
			return err
		}
	}

	return nil
}

func (a *App) initServiceProvider(_ context.Context) error {
	a.serviceProvider = newServiceProvider()
	return nil
}

func (a *App) initAdminSync(ctx context.Context) error {
	adminEmails := a.serviceProvider.Config().AdminEmails()
	if err := a.serviceProvider.UserService(ctx).SyncAdminsByEmails(adminEmails); err != nil {
		return err
	}
	logger.Info("Synced admins by email", slog.Any("admins", adminEmails))
	return nil
}

func (a *App) initChatCleanup(_ context.Context) error {
	ttl := a.serviceProvider.Config().ChatMessageCleanupTTL()
	if ttl <= 0 {
		return nil
	}

	interval := max(min(ttl, 15*time.Minute), time.Minute)

	done := make(chan struct{})
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				if err := a.serviceProvider.ChatService(context.Background()).CleanupExpiredMessages(context.Background()); err != nil {
					logger.Error("chat cleanup failed",
						slog.Duration("ttl", ttl),
						slog.String("err", err.Error()),
					)
					continue
				}
				logger.Debug("chat cleanup completed",
					slog.Duration("ttl", ttl),
				)
			}
		}
	}()

	closer.Add(func() error {
		close(done)
		return nil
	})

	logger.Info("chat cleanup job started",
		slog.Duration("ttl", ttl),
		slog.Duration("interval", interval),
	)
	return nil
}

func (a *App) initFiber(_ context.Context) error {

	a.fiberApp = fiber.New()
	a.fiberApp.Use(fiberlogger.New())
	allowedOrigins := buildAllowedOrigins(
		os.Getenv("CORS_ALLOWED_ORIGINS"),
		a.serviceProvider.Config().OAuthConfig().FrontendBase,
	)
	a.fiberApp.Use(cors.New(cors.Config{
		AllowOrigins:     allowedOrigins,
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization",
		AllowMethods:     "GET, POST, PUT, PATCH, DELETE, OPTIONS",
		AllowCredentials: true,
	}))
	a.fiberApp.Use(authMiddleware(a.serviceProvider.Config(), a.serviceProvider.UserService(context.Background())))

	swagger, err := api.GetSwagger()
	if err != nil {
		return err
	}
	swagger.Servers = nil

	specBytes, err := swagger.MarshalJSON()
	if err != nil {
		return err
	}

	a.fiberApp.Get("/openapi.json", func(c *fiber.Ctx) error {
		c.Type("json")
		return c.Send(specBytes)
	})

	validatorOpts := &oasfiber.Options{
		Options: openapi3filter.Options{
			AuthenticationFunc: func(_ context.Context, _ *openapi3filter.AuthenticationInput) error {
				// TODO: plug actual auth; currently accept any provided Authorization header.
				return nil
			},
		},
	}

	a.fiberApp.Use(oasfiber.OapiRequestValidatorWithOptions(swagger, validatorOpts))

	return nil
}

func buildAllowedOrigins(rawAllowed string, frontendBase string) string {
	if strings.TrimSpace(rawAllowed) != "" {
		parts := strings.Split(rawAllowed, ",")
		origins := make([]string, 0, len(parts))
		for _, part := range parts {
			value := strings.TrimSpace(part)
			if value == "" {
				continue
			}
			origins = append(origins, value)
		}
		if len(origins) > 0 {
			return strings.Join(origins, ",")
		}
	}

	origins := []string{}
	if strings.TrimSpace(frontendBase) != "" {
		origins = append(origins, frontendBase)
	}
	origins = append(origins, "http://localhost:3000")
	return strings.Join(origins, ",")
}

func (a *App) InitHandlers(ctx context.Context) error {
	handler := apihandler.New(
		a.serviceProvider.Config(),
		a.serviceProvider.AuthService(ctx),
		a.serviceProvider.SpaceService(ctx),
		a.serviceProvider.ChatService(ctx),
		a.serviceProvider.UserService(ctx),
		a.serviceProvider.VoiceService(ctx),
		a.serviceProvider.JanusService(ctx),
		a.serviceProvider.EventsHub(),
	)
	api.RegisterHandlers(a.fiberApp, handler)
	a.fiberApp.Post("/api/voice/state", handler.UpdateVoiceState)
	return nil
}

func (a *App) initConfig(_ context.Context) error {
	err := config.Load(".env")
	if err != nil {
		return err
	}

	return nil
}

func (a *App) InitLogger(ctx context.Context) error {
	logLvl := slog.LevelInfo

	if strings.ToLower(os.Getenv("DEBUG")) == "true" {
		logLvl = slog.LevelDebug
	}

	opts := &slog.HandlerOptions{

		Level: logLvl,
	}
	logger.Init(slog.NewJSONHandler(os.Stdout, opts))
	return nil
}

func (a *App) Run() error {
	defer func() {
		closer.CloseAll()
		closer.Wait()
	}()
	return a.runFiber()
}

func (a *App) runFiber() error {
	address := a.serviceProvider.Config().ServerAdress()

	logger.Info("server is running", slog.String("address", address))
	err := a.fiberApp.Listen(address)
	if err != nil {
		return err
	}
	return nil
}
