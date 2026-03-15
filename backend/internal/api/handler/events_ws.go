package handler

import (
	"encoding/json"
	"log/slog"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"

	"zerizeha/internal/dto"
	"zerizeha/internal/service"
	"zerizeha/pkg/logger"
)

type EventsHub struct {
	register   chan *eventsWSConn
	unregister chan *eventsWSConn
	send       chan userEventBroadcast

	byUser map[string]map[*eventsWSConn]struct{}
}

type eventsWSConn struct {
	ws     *websocket.Conn
	userID string
}

type userEventBroadcast struct {
	userIDs []string
	msg     wsEnvelope
}

type chatEventPublisher struct {
	hub *EventsHub
}

type voiceEventPublisher struct {
	hub *EventsHub
}

// NewEventsHub creates a user-scoped in-memory hub for product events.
func NewEventsHub() *EventsHub {
	h := &EventsHub{
		register:   make(chan *eventsWSConn, 64),
		unregister: make(chan *eventsWSConn, 64),
		send:       make(chan userEventBroadcast, 256),
		byUser:     make(map[string]map[*eventsWSConn]struct{}),
	}
	go h.loop()
	return h
}

// NewChatEventPublisher creates a websocket-backed chat event publisher.
func NewChatEventPublisher(hub *EventsHub) service.ChatEventPublisher {
	return &chatEventPublisher{hub: hub}
}

// NewVoiceEventPublisher creates a websocket-backed voice event publisher.
func NewVoiceEventPublisher(hub *EventsHub) service.VoiceEventPublisher {
	return &voiceEventPublisher{hub: hub}
}

func (h *EventsHub) loop() {
	for {
		select {
		case c := <-h.register:
			set := h.byUser[c.userID]
			if set == nil {
				set = make(map[*eventsWSConn]struct{})
				h.byUser[c.userID] = set
			}
			set[c] = struct{}{}
		case c := <-h.unregister:
			set := h.byUser[c.userID]
			if set != nil {
				delete(set, c)
				if len(set) == 0 {
					delete(h.byUser, c.userID)
				}
			}
		case b := <-h.send:
			if len(b.userIDs) == 0 {
				continue
			}
			for _, userID := range b.userIDs {
				set := h.byUser[userID]
				if len(set) == 0 {
					continue
				}
				for c := range set {
					_ = writeWS(c.ws, b.msg)
				}
			}
		}
	}
}

func (h *EventsHub) Register(c *eventsWSConn) {
	h.register <- c
}

func (h *EventsHub) Unregister(c *eventsWSConn) {
	h.unregister <- c
}

func (h *EventsHub) SendToUsers(userIDs []string, msg wsEnvelope) {
	h.send <- userEventBroadcast{userIDs: userIDs, msg: msg}
}

func (p *chatEventPublisher) PublishChannelMessageCreated(recipientUserIDs []string, event dto.ChannelMessageCreatedEvent) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}

	p.hub.SendToUsers(recipientUserIDs, wsEnvelope{
		Type:    "chat.message_created",
		Payload: payload,
	})
	return nil
}

func (p *chatEventPublisher) PublishChannelCompacted(recipientUserIDs []string, event dto.ChannelCompactedEvent) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}

	p.hub.SendToUsers(recipientUserIDs, wsEnvelope{
		Type:    "chat.channel_compacted",
		Payload: payload,
	})
	return nil
}

func (p *voiceEventPublisher) PublishChannelMembers(recipientUserIDs []string, event dto.VoiceChannelMembersEvent) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}

	p.hub.SendToUsers(recipientUserIDs, wsEnvelope{
		Type:    "voice.channel_members",
		Payload: payload,
	})
	return nil
}

// EventsWebSocket upgrades the request to a user-scoped event stream connection.
func (h *Handler) EventsWebSocket(c *fiber.Ctx) error {
	if !websocket.IsWebSocketUpgrade(c) {
		return writeHTTPError(c, fiber.StatusUpgradeRequired, "upgrade required")
	}
	return websocket.New(h.eventsWS)(c)
}

func (h *Handler) eventsWS(c *websocket.Conn) {
	userID, ok := c.Locals(UserIDLocalKey).(string)
	if !ok || userID == "" {
		_ = writeWS(c, wsEnvelope{Type: "error", Payload: []byte(`{"message":"unauthorized"}`)})
		_ = c.Close()
		return
	}

	conn := &eventsWSConn{ws: c, userID: userID}
	h.eventsHub.Register(conn)
	defer h.eventsHub.Unregister(conn)

	logger.Info("events ws connected", slog.String("user_id", userID))

	readyPayload, _ := json.Marshal(map[string]any{"user_id": userID})
	_ = writeWS(c, wsEnvelope{Type: "ready", Payload: readyPayload})
	if err := h.sendInitialVoiceSnapshots(userID, conn); err != nil {
		logger.Error("events ws initial voice snapshots failed",
			slog.String("user_id", userID),
			slog.String("err", err.Error()),
		)
		_ = writeWS(c, wsEnvelope{Type: "error", Payload: []byte(`{"message":"failed to load initial voice state"}`)})
		_ = c.Close()
		return
	}

	for {
		_, _, err := c.ReadMessage()
		if err != nil {
			break
		}
	}

	logger.Info("events ws disconnected", slog.String("user_id", userID))
}
