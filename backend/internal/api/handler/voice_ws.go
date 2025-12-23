package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"

	api "zerizeha/internal/api"
	"zerizeha/pkg/logger"
)

type voiceHub struct {
	register   chan *voiceWSConn
	unregister chan *voiceWSConn
	broadcast  chan voiceBroadcast

	bySpace map[string]map[*voiceWSConn]struct{}
}

type voiceWSConn struct {
	ws      *websocket.Conn
	spaceID string
	userID  string
}

type voiceBroadcast struct {
	spaceID string
	msg     wsEnvelope
}

func newVoiceHub() *voiceHub {
	h := &voiceHub{
		register:   make(chan *voiceWSConn, 64),
		unregister: make(chan *voiceWSConn, 64),
		broadcast:  make(chan voiceBroadcast, 256),
		bySpace:    make(map[string]map[*voiceWSConn]struct{}),
	}
	go h.loop()
	return h
}

func (h *voiceHub) loop() {
	for {
		select {
		case c := <-h.register:
			set := h.bySpace[c.spaceID]
			if set == nil {
				set = make(map[*voiceWSConn]struct{})
				h.bySpace[c.spaceID] = set
			}
			set[c] = struct{}{}
		case c := <-h.unregister:
			set := h.bySpace[c.spaceID]
			if set != nil {
				delete(set, c)
				if len(set) == 0 {
					delete(h.bySpace, c.spaceID)
				}
			}
		case b := <-h.broadcast:
			set := h.bySpace[b.spaceID]
			if len(set) == 0 {
				continue
			}
			for c := range set {
				_ = writeWS(c.ws, b.msg)
			}
		}
	}
}

func (h *voiceHub) Register(c *voiceWSConn) {
	h.register <- c
}

func (h *voiceHub) Unregister(c *voiceWSConn) {
	h.unregister <- c
}

func (h *voiceHub) Broadcast(spaceID string, msg wsEnvelope) {
	h.broadcast <- voiceBroadcast{spaceID: spaceID, msg: msg}
}

func (h *Handler) VoicePresenceWebSocket(c *fiber.Ctx, spaceId string) error {
	if !websocket.IsWebSocketUpgrade(c) {
		return writeHTTPError(c, fiber.StatusUpgradeRequired, "upgrade required")
	}
	_ = spaceId
	return websocket.New(h.voicePresenceWS)(c)
}

func (h *Handler) voicePresenceWS(c *websocket.Conn) {
	userID, ok := c.Locals(UserIDLocalKey).(string)
	if !ok || userID == "" {
		_ = writeWS(c, wsEnvelope{Type: "error", Payload: []byte(`{"message":"unauthorized"}`)})
		_ = c.Close()
		return
	}

	spaceID := c.Params("spaceId")
	if spaceID == "" {
		_ = writeWS(c, wsEnvelope{Type: "error", Payload: []byte(`{"message":"missing spaceId"}`)})
		_ = c.Close()
		return
	}

	isMember, err := h.space.IsSpaceMember(spaceID, userID)
	if err != nil {
		logger.Error("voice ws: space member check failed",
			slog.String("user_id", userID),
			slog.String("space_id", spaceID),
			slog.String("err", err.Error()),
		)
		_ = writeWS(c, wsEnvelope{Type: "error", Payload: []byte(`{"message":"internal error"}`)})
		_ = c.Close()
		return
	}
	if !isMember {
		_ = writeWS(c, wsEnvelope{Type: "error", Payload: []byte(`{"message":"forbidden"}`)})
		_ = c.Close()
		return
	}

	conn := &voiceWSConn{ws: c, spaceID: spaceID, userID: userID}
	h.voiceHub.Register(conn)
	defer h.voiceHub.Unregister(conn)

	logger.Info("voice ws connected",
		slog.String("user_id", userID),
		slog.String("space_id", spaceID),
	)

	// Initial snapshot.
	snapshot, err := h.buildVoicePresenceSnapshot(context.Background(), spaceID)
	if err == nil {
		_ = writeWS(c, wsEnvelope{Type: "snapshot", Payload: snapshot})
	}

	// Server-side heartbeat: keep user's presence alive while WS is open.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() {
		t := time.NewTicker(15 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				ch, err := h.voice.GetUserChannelID(context.Background(), userID)
				if err != nil || ch == "" {
					continue
				}
				_ = h.voice.Heartbeat(context.Background(), userID)
			}
		}
	}()

	for {
		_, _, err := c.ReadMessage()
		if err != nil {
			break
		}
		// MVP: no client->server messages needed.
	}

	cancel()
	logger.Info("voice ws disconnected",
		slog.String("user_id", userID),
		slog.String("space_id", spaceID),
	)
}

func (h *Handler) buildVoicePresenceSnapshot(ctx context.Context, spaceID string) ([]byte, error) {
	channels, err := h.space.ListChannelsBySpace(spaceID)
	if err != nil {
		return nil, err
	}

	result := make(map[string][]api.VoiceMember)
	for _, ch := range channels {
		if ch.ChannelType != "voice" {
			continue
		}

		ids, err := h.voice.ListMemberIDs(ctx, ch.ID)
		if err != nil {
			return nil, err
		}
		users, err := h.user.GetUsersByIDs(ids)
		if err != nil {
			return nil, err
		}
		userByID := make(map[string]struct {
			username string
			isAdmin  bool
		}, len(users))
		for _, u := range users {
			userByID[u.ID] = struct {
				username string
				isAdmin  bool
			}{username: u.Username, isAdmin: u.IsAdmin}
		}

		members := make([]api.VoiceMember, 0, len(ids))
		for _, uid := range ids {
			info, ok := userByID[uid]
			if !ok {
				continue
			}
			members = append(members, api.VoiceMember{
				Id:       uid,
				Username: info.username,
				IsAdmin:  info.isAdmin,
			})
		}
		result[ch.ID] = members
	}

	payload, _ := json.Marshal(map[string]any{
		"voice_members_by_channel_id": result,
	})
	return payload, nil
}

func (h *Handler) broadcastVoiceChannelMembers(spaceID string, channelID string) {
	payload, err := h.buildVoiceChannelMembersPayload(context.Background(), channelID)
	if err != nil {
		return
	}
	h.voiceHub.Broadcast(spaceID, wsEnvelope{Type: "channel_members", Payload: payload})
}

func (h *Handler) buildVoiceChannelMembersPayload(ctx context.Context, channelID string) ([]byte, error) {
	ids, err := h.voice.ListMemberIDs(ctx, channelID)
	if err != nil {
		return nil, err
	}

	users, err := h.user.GetUsersByIDs(ids)
	if err != nil {
		return nil, err
	}
	userByID := make(map[string]struct {
		username string
		isAdmin  bool
	}, len(users))
	for _, u := range users {
		userByID[u.ID] = struct {
			username string
			isAdmin  bool
		}{username: u.Username, isAdmin: u.IsAdmin}
	}

	members := make([]api.VoiceMember, 0, len(ids))
	for _, uid := range ids {
		info, ok := userByID[uid]
		if !ok {
			continue
		}
		members = append(members, api.VoiceMember{
			Id:       uid,
			Username: info.username,
			IsAdmin:  info.isAdmin,
		})
	}

	data, _ := json.Marshal(map[string]any{
		"channel_id": channelID,
		"members":    members,
	})
	return data, nil
}
