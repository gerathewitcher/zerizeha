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
	user        service.UserService
	voice       service.VoiceService
	janus       service.JanusService

	webrtc *webrtcStore
	voiceHub *voiceHub
}

var _ api.ServerInterface = (*Handler)(nil)

const (
	UserIDLocalKey = "userID"
	UserLocalKey   = "user"
)

func New(cfg config.Config, authService authservice.Service, space service.SpaceService, user service.UserService, voice service.VoiceService, janus service.JanusService) *Handler {
	return &Handler{
		cfg:         cfg,
		authService: authService,
		space:       space,
		user:        user,
		voice:       voice,
		janus:       janus,
		webrtc:      newWebRTCStore(),
		voiceHub:    newVoiceHub(),
	}
}
