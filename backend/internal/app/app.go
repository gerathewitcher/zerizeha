package app

import (
	"context"
	"log/slog"
	"os"
	"strings"
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
		a.initFiber,
		a.InitAuthHandler,
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

func (a *App) initFiber(_ context.Context) error {

	a.fiberApp = fiber.New()
	a.fiberApp.Use(fiberlogger.New())
	a.fiberApp.Use(cors.New(cors.Config{
		AllowOrigins:     "http://localhost:3000",
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization",
		AllowMethods:     "GET, POST, PUT, PATCH, DELETE, OPTIONS",
		AllowCredentials: true,
	}))
	a.fiberApp.Use(authMiddleware(a.serviceProvider.Config()))

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

func (a *App) InitAuthHandler(ctx context.Context) error {
	handler := apihandler.New(a.serviceProvider.Config(), a.serviceProvider.AuthService(ctx), a.serviceProvider.SpaceService(ctx))
	api.RegisterHandlers(a.fiberApp, handler)
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
