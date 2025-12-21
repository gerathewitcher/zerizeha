package handler

import (
	api "zerizeha/internal/api"
	"zerizeha/internal/config"
	"zerizeha/internal/service"
	authservice "zerizeha/internal/service/auth"
)

type Handler struct {
	cfg         config.Config
	authService authservice.Service
	space       service.SpaceService
}

var _ api.ServerInterface = (*Handler)(nil)

const UserIDLocalKey = "userID"

func New(cfg config.Config, authService authservice.Service, space service.SpaceService) *Handler {
	return &Handler{
		cfg:         cfg,
		authService: authService,
		space:       space,
	}
}
