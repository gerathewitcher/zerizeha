package app

import (
	"context"
	"log"
	"zerizeha/internal/config"
	"zerizeha/internal/repository"
	pgSpaceRepo "zerizeha/internal/repository/postgres/space"
	pgUserRepo "zerizeha/internal/repository/postgres/user"
	"zerizeha/internal/service"
	authservice "zerizeha/internal/service/auth"
	spaceservice "zerizeha/internal/service/space"
	userservice "zerizeha/internal/service/user"
	"zerizeha/pkg/closer"
	"zerizeha/pkg/db"
	"zerizeha/pkg/db/pg"
)

type serviceProvider struct {
	config       config.Config
	dbClient     db.Client
	userRepo     repository.UserRepository
	spaceRepo    repository.SpaceRepository
	userService  service.UserService
	spaceService service.SpaceService
	authService  authservice.Service
}

func newServiceProvider() *serviceProvider {
	return &serviceProvider{}
}

func (s *serviceProvider) Config() config.Config {
	if s.config == nil {
		cfg, err := config.NewConfig()
		if err != nil {
			log.Fatalf("failed to init config: %s", err.Error())
		}
		s.config = cfg
	}
	return s.config
}

func (s *serviceProvider) DBClient(ctx context.Context) db.Client {

	if s.dbClient == nil {
		cl, err := pg.New(ctx, s.Config().PGConfig().DSN())
		if err != nil {
			log.Fatalf("failed to create DB client: %v", err)
		}

		err = cl.DB().Ping(ctx)

		if err != nil {
			log.Fatalf("ping error: %s", err.Error())
		}
		closer.Add(cl.Close)

		s.dbClient = cl
	}

	return s.dbClient
}

func (s *serviceProvider) UserRepository(ctx context.Context) repository.UserRepository {
	if s.userRepo == nil {
		s.userRepo = pgUserRepo.NewPostgresUserRepo(s.DBClient(ctx))
	}
	return s.userRepo
}

func (s *serviceProvider) SpaceRepository(ctx context.Context) repository.SpaceRepository {
	if s.spaceRepo == nil {
		s.spaceRepo = pgSpaceRepo.NewPostgresSpaceRepo(s.DBClient(ctx))
	}
	return s.spaceRepo
}

func (s *serviceProvider) UserService(ctx context.Context) service.UserService {
	if s.userService == nil {
		s.userService = userservice.NewUserService(s.UserRepository(ctx))
	}
	return s.userService
}

func (s *serviceProvider) SpaceService(ctx context.Context) service.SpaceService {
	if s.spaceService == nil {
		s.spaceService = spaceservice.NewSpaceService(s.SpaceRepository(ctx))
	}
	return s.spaceService
}

func (s *serviceProvider) AuthService(ctx context.Context) authservice.Service {
	if s.authService == nil {
		s.authService = authservice.NewService(s.UserService(ctx), s.Config())
	}
	return s.authService
}
