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
	chat        service.ChatService
	user        service.UserService
	voice       service.VoiceService
	janus       service.JanusService

	webrtc    *webrtcStore
	eventsHub *EventsHub
}

var _ api.ServerInterface = (*Handler)(nil)

const (
	UserIDLocalKey = "userID"
	UserLocalKey   = "user"
)

func New(cfg config.Config, authService authservice.Service, space service.SpaceService, chat service.ChatService, user service.UserService, voice service.VoiceService, janus service.JanusService, eventsHub *EventsHub) *Handler {
	if eventsHub == nil {
		eventsHub = NewEventsHub()
	}
	return &Handler{
		cfg:         cfg,
		authService: authService,
		space:       space,
		chat:        chat,
		user:        user,
		voice:       voice,
		janus:       janus,
		webrtc:      newWebRTCStore(),
		eventsHub:   eventsHub,
	}
}
