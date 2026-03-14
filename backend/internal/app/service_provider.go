package app

import (
	"context"
	"log"
	apihandler "zerizeha/internal/api/handler"
	"zerizeha/internal/config"
	"zerizeha/internal/repository"
	pgChatRepo "zerizeha/internal/repository/postgres/chat"
	pgSpaceRepo "zerizeha/internal/repository/postgres/space"
	pgUserRepo "zerizeha/internal/repository/postgres/user"
	"zerizeha/internal/service"
	authservice "zerizeha/internal/service/auth"
	chatservice "zerizeha/internal/service/chat"
	janusservice "zerizeha/internal/service/janus"
	spaceservice "zerizeha/internal/service/space"
	userservice "zerizeha/internal/service/user"
	voiceservice "zerizeha/internal/service/voice"
	"zerizeha/pkg/closer"
	"zerizeha/pkg/db"
	"zerizeha/pkg/db/pg"
	"zerizeha/pkg/redisx"

	"github.com/redis/go-redis/v9"
)

type serviceProvider struct {
	config       config.Config
	dbClient     db.Client
	redisClient  *redis.Client
	userRepo     repository.UserRepository
	spaceRepo    repository.SpaceRepository
	chatRepo     repository.ChatRepository
	userService  service.UserService
	spaceService service.SpaceService
	chatService  service.ChatService
	eventsHub    *apihandler.EventsHub
	voiceService service.VoiceService
	janusService service.JanusService
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

func (s *serviceProvider) RedisClient(ctx context.Context) *redis.Client {
	if s.redisClient == nil {
		client := redisx.New(s.Config().RedisConfig().Address)
		if err := redisx.Ping(ctx, client); err != nil {
			log.Fatalf("failed to connect to redis: %v", err)
		}
		closer.Add(client.Close)
		s.redisClient = client
	}
	return s.redisClient
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

func (s *serviceProvider) ChatRepository(ctx context.Context) repository.ChatRepository {
	if s.chatRepo == nil {
		s.chatRepo = pgChatRepo.NewPostgresChatRepo(s.DBClient(ctx))
	}
	return s.chatRepo
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

func (s *serviceProvider) ChatService(ctx context.Context) service.ChatService {
	if s.chatService == nil {
		s.chatService = chatservice.NewChatService(
			s.ChatRepository(ctx),
			s.SpaceService(ctx),
			apihandler.NewChatEventPublisher(s.EventsHub()),
			s.Config().ChatMessageCleanupTTL(),
		)
	}
	return s.chatService
}

func (s *serviceProvider) EventsHub() *apihandler.EventsHub {
	if s.eventsHub == nil {
		s.eventsHub = apihandler.NewEventsHub()
	}
	return s.eventsHub
}

func (s *serviceProvider) AuthService(ctx context.Context) authservice.Service {
	if s.authService == nil {
		s.authService = authservice.NewService(s.UserService(ctx), s.Config())
	}
	return s.authService
}

func (s *serviceProvider) VoiceService(ctx context.Context) service.VoiceService {
	if s.voiceService == nil {
		s.voiceService = voiceservice.New(s.RedisClient(ctx), s.Config().VoicePresenceTTLSeconds())
	}
	return s.voiceService
}

func (s *serviceProvider) JanusService(_ context.Context) service.JanusService {
	if s.janusService == nil {
		s.janusService = janusservice.New(s.Config().JanusWSURL())
	}
	return s.janusService
}
