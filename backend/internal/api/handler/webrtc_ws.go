package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"

	"zerizeha/internal/service"
	janus "zerizeha/internal/service/janus"
	"zerizeha/pkg/logger"
)

func sdpHasSendingVideo(sdp string) bool {
	idx := strings.Index(sdp, "m=video")
	if idx < 0 {
		return false
	}
	rest := sdp[idx:]
	next := strings.Index(rest[1:], "\nm=")
	section := rest
	if next >= 0 {
		section = rest[:next+1]
	}
	section = strings.ToLower(section)
	return strings.Contains(section, "a=sendrecv") || strings.Contains(section, "a=sendonly")
}

func (h *Handler) WebRTCWebSocket(c *fiber.Ctx, connectionId string) error {
	if !websocket.IsWebSocketUpgrade(c) {
		return writeHTTPError(c, fiber.StatusUpgradeRequired, "upgrade required")
	}
	// Ensure the param is available for the websocket handler (it reads c.Params()).
	_ = connectionId
	return websocket.New(h.webrtcWS)(c)
}

type wsEnvelope struct {
	Type      string          `json:"type"`
	RequestID string          `json:"request_id,omitempty"`
	Payload   json.RawMessage `json:"payload,omitempty"`
}

func writeWS(c *websocket.Conn, msg wsEnvelope) error {
	data, _ := json.Marshal(msg)
	return c.WriteMessage(websocket.TextMessage, data)
}

func (h *Handler) webrtcWS(c *websocket.Conn) {
	userID, ok := c.Locals(UserIDLocalKey).(string)
	if !ok || userID == "" {
		logger.Warn("webrtc ws unauthorized", slog.String("ip", c.RemoteAddr().String()))
		_ = writeWS(c, wsEnvelope{Type: "error", Payload: []byte(`{"message":"unauthorized"}`)})
		_ = c.Close()
		return
	}

	connectionID := strings.TrimSpace(c.Params("connectionId"))
	conn, ok := h.webrtc.Get(connectionID)
	if !ok {
		logger.Warn("webrtc ws unknown connection",
			slog.String("user_id", userID),
			slog.String("connection_id", connectionID),
		)
		_ = writeWS(c, wsEnvelope{Type: "error", Payload: []byte(`{"message":"unknown connection"}`)})
		_ = c.Close()
		return
	}
	if conn.UserID != userID {
		logger.Warn("webrtc ws forbidden",
			slog.String("user_id", userID),
			slog.String("connection_owner", conn.UserID),
			slog.String("connection_id", connectionID),
		)
		_ = writeWS(c, wsEnvelope{Type: "error", Payload: []byte(`{"message":"forbidden"}`)})
		_ = c.Close()
		return
	}
	conn.SetWS(c)
	defer conn.ClearWS()

	logger.Info("webrtc ws connected",
		slog.String("user_id", userID),
		slog.String("connection_id", connectionID),
		slog.String("channel_id", conn.ChannelID),
		slog.Int64("janus_session_id", conn.JanusSessionID),
	)

	// Subscribe to Janus events to notify about new publishers/leavers and trickle candidates.
	janusSvc, ok := h.janus.(interface {
		Subscribe(buffer int) (<-chan janus.Message, func())
	})
	if !ok {
		conn.SendWS(wsEnvelope{Type: "error", Payload: []byte(`{"message":"janus service does not support events"}`)})
		_ = c.Close()
		return
	}

	events, cancel := janusSvc.Subscribe(2048)
	defer cancel()

	ctx, cancelCtx := context.WithCancel(context.Background())
	defer cancelCtx()

	// Janus sessions expire unless we send periodic keepalive.
	keepaliveDone := make(chan struct{})
	go func() {
		defer close(keepaliveDone)
		t := time.NewTicker(25 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				ctxReq, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				err := h.janus.KeepAlive(ctxReq, conn.JanusSessionID)
				cancel()
				if err != nil {
					logger.Warn("webrtc ws janus keepalive failed",
						slog.String("user_id", userID),
						slog.String("connection_id", connectionID),
						slog.Int64("janus_session_id", conn.JanusSessionID),
						slog.String("err", err.Error()),
					)
				}
			}
		}
	}()

	go func() {
		defer cancelCtx()
		for {
			select {
			case <-ctx.Done():
				return
			case ev, ok := <-events:
				if !ok {
					return
				}
				if ev.SessionID != conn.JanusSessionID {
					continue
				}

				// Trickle candidates from Janus -> browser.
				if strings.ToLower(ev.Janus) == "trickle" && len(ev.Candidate) > 0 {
					handleID := ev.Sender
					if handleID == 0 {
						handleID = ev.HandleID
					}

					target := "unknown"
					var feedID string
					switch handleID {
					case conn.PublisherHandleID:
						target = "publisher"
					case conn.ScreenHandleID:
						target = "screen_publisher"
					default:
						conn.mu.Lock()
						for feed, hID := range conn.SubscriberHandlesByFeed {
							if hID == handleID {
								target = "subscriber"
								feedID = feed
								break
							}
						}
						conn.mu.Unlock()
					}

					payload, _ := json.Marshal(map[string]any{
						"target":    target,
						"feed_id":   feedID,
						"candidate": json.RawMessage(ev.Candidate),
					})
					logger.Debug("webrtc ws janus trickle -> client",
						slog.String("user_id", userID),
						slog.String("connection_id", connectionID),
						slog.String("target", target),
						slog.String("feed_id", feedID),
					)
					conn.SendWS(wsEnvelope{Type: "trickle", Payload: payload})
					continue
				}

				// Videoroom publisher changes.
				if strings.ToLower(ev.Janus) == "event" && ev.PluginData != nil && len(ev.PluginData.Data) > 0 {
					var update struct {
						Videoroom  string `json:"videoroom"`
						Publishers []struct {
							ID      string `json:"id"`
							Display string `json:"display,omitempty"`
						} `json:"publishers,omitempty"`
						Leaving     string `json:"leaving,omitempty"`
						Unpublished string `json:"unpublished,omitempty"`
					}
					if err := json.Unmarshal(ev.PluginData.Data, &update); err != nil {
						continue
					}

					if len(update.Publishers) > 0 {
						for _, p := range update.Publishers {
							logger.Debug("webrtc ws publisher joined (janus event)",
								slog.String("user_id", userID),
								slog.String("connection_id", connectionID),
								slog.String("feed_id", p.ID),
								slog.String("display", p.Display),
							)
						}
					}
					left := update.Leaving
					if left == "" {
						left = update.Unpublished
					}
					if left != "" && left != "ok" {
						logger.Info("webrtc ws publisher left",
							slog.String("user_id", userID),
							slog.String("connection_id", connectionID),
							slog.String("feed_id", left),
						)
						payload, _ := json.Marshal(map[string]any{"feed_id": left})
						conn.SendWS(wsEnvelope{Type: "publisher_left", Payload: payload})
					}
				}
			}
		}
	}()

	// Send initial state.
	{
		conn.mu.Lock()
		initial := make([]map[string]any, 0, len(conn.KnownPublishers))
		for _, p := range conn.KnownPublishers {
			initial = append(initial, map[string]any{"feed_id": p.FeedID, "display": p.Display})
		}
		conn.mu.Unlock()
		payload, _ := json.Marshal(map[string]any{"publishers": initial})
		conn.SendWS(wsEnvelope{Type: "ready", Payload: payload})
	}

	for {
		_, data, err := c.ReadMessage()
		if err != nil {
			break
		}
		var msg wsEnvelope
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}

		logger.Debug("webrtc ws recv",
			slog.String("user_id", userID),
			slog.String("connection_id", connectionID),
			slog.String("type", msg.Type),
			slog.String("request_id", msg.RequestID),
		)

		switch msg.Type {
		case "publish_offer":
			var payload struct {
				JSEP struct {
					Type string `json:"type"`
					SDP  string `json:"sdp"`
				} `json:"jsep"`
			}
			if err := json.Unmarshal(msg.Payload, &payload); err != nil {
				conn.SendWS(wsEnvelope{Type: "error", RequestID: msg.RequestID, Payload: []byte(`{"message":"invalid payload"}`)})
				continue
			}

			logger.Info("webrtc ws publish_offer",
				slog.String("user_id", userID),
				slog.String("connection_id", connectionID),
				slog.String("room_id", conn.RoomID),
			)

			ctxReq, cancel := context.WithTimeout(context.Background(), 4*time.Second)
			answer, err := h.janus.Publish(ctxReq, conn.JanusSessionID, conn.PublisherHandleID, service.JanusJSEP{Type: payload.JSEP.Type, SDP: payload.JSEP.SDP})
			cancel()
			if err != nil {
				logger.Error("webrtc ws publish failed",
					slog.String("user_id", userID),
					slog.String("connection_id", connectionID),
					slog.String("room_id", conn.RoomID),
					slog.String("err", err.Error()),
				)
				conn.SendWS(wsEnvelope{Type: "error", RequestID: msg.RequestID, Payload: []byte(`{"message":"publish failed"}`)})
				continue
			}

			respPayload, _ := json.Marshal(map[string]any{
				"jsep": map[string]any{
					"type": answer.Type,
					"sdp":  answer.SDP,
				},
			})
			conn.SendWS(wsEnvelope{Type: "publish_answer", RequestID: msg.RequestID, Payload: respPayload})

			logger.Info("webrtc ws publish broadcast",
				slog.String("user_id", userID),
				slog.String("connection_id", connectionID),
				slog.String("room_id", conn.RoomID),
				slog.String("feed_id", conn.PublisherFeedID),
				slog.String("display", conn.Display),
			)
			joinPayload, _ := json.Marshal(map[string]any{
				"feed_id": conn.PublisherFeedID,
				"display": conn.Display,
			})
			h.webrtc.ForEach(func(other *webrtcConn) {
				if other.RoomID != conn.RoomID || other.ID == conn.ID {
					return
				}
				other.SendWS(wsEnvelope{Type: "publisher_joined", Payload: joinPayload})
			})

		case "screen_publish_offer":
			var payload struct {
				JSEP struct {
					Type string `json:"type"`
					SDP  string `json:"sdp"`
				} `json:"jsep"`
			}
			if err := json.Unmarshal(msg.Payload, &payload); err != nil {
				conn.SendWS(wsEnvelope{Type: "error", RequestID: msg.RequestID, Payload: []byte(`{"message":"invalid payload"}`)})
				continue
			}

			logger.Info("webrtc ws screen_publish_offer",
				slog.String("user_id", userID),
				slog.String("connection_id", connectionID),
				slog.String("room_id", conn.RoomID),
			)

			ctxReq, cancel := context.WithTimeout(context.Background(), 20*time.Second)

			conn.mu.Lock()
			screenHandleID := conn.ScreenHandleID
			screenFeedID := conn.ScreenFeedID
			conn.mu.Unlock()
			screenDisplay := conn.Display + "|screen"

			if screenHandleID == 0 {
				handleID, err := h.janus.AttachVideoroom(ctxReq, conn.JanusSessionID)
				if err != nil {
					cancel()
					logger.Error("webrtc ws screen attach videoroom failed",
						slog.String("user_id", userID),
						slog.String("connection_id", connectionID),
						slog.String("room_id", conn.RoomID),
						slog.String("err", err.Error()),
					)
					conn.SendWS(wsEnvelope{Type: "error", RequestID: msg.RequestID, Payload: []byte(`{"message":"screen attach failed"}`)})
					continue
				}
				screenHandleID = handleID
				feedID, _, err := h.janus.JoinPublisher(ctxReq, conn.JanusSessionID, screenHandleID, conn.RoomID, screenDisplay)
				if err != nil {
					var vrErr *janus.VideoroomError
					if errors.As(err, &vrErr) && vrErr.Code == 426 {
						if ensureErr := h.janus.EnsureRoom(ctxReq, conn.JanusSessionID, conn.PublisherHandleID, conn.RoomID); ensureErr == nil {
							feedID, _, err = h.janus.JoinPublisher(ctxReq, conn.JanusSessionID, screenHandleID, conn.RoomID, screenDisplay)
						} else {
							err = ensureErr
						}
					}
				}
				if err != nil {
					cancel()
					logger.Error("webrtc ws screen join failed",
						slog.String("user_id", userID),
						slog.String("connection_id", connectionID),
						slog.String("room_id", conn.RoomID),
						slog.String("err", err.Error()),
					)
					conn.SendWS(wsEnvelope{Type: "error", RequestID: msg.RequestID, Payload: []byte(`{"message":"screen join failed"}`)})
					continue
				}
				screenFeedID = feedID
				conn.mu.Lock()
				conn.ScreenHandleID = screenHandleID
				conn.ScreenFeedID = screenFeedID
				conn.mu.Unlock()
			}

			answer, err := h.janus.Publish(ctxReq, conn.JanusSessionID, screenHandleID, service.JanusJSEP{Type: payload.JSEP.Type, SDP: payload.JSEP.SDP})
			cancel()
			if err != nil {
				logger.Error("webrtc ws screen publish failed",
					slog.String("user_id", userID),
					slog.String("connection_id", connectionID),
					slog.String("room_id", conn.RoomID),
					slog.String("err", err.Error()),
				)
				conn.SendWS(wsEnvelope{Type: "error", RequestID: msg.RequestID, Payload: []byte(`{"message":"screen publish failed"}`)})
				continue
			}

			respPayload, _ := json.Marshal(map[string]any{
				"feed_id": screenFeedID,
				"jsep": map[string]any{
					"type": answer.Type,
					"sdp":  answer.SDP,
				},
			})
			conn.SendWS(wsEnvelope{Type: "screen_publish_answer", RequestID: msg.RequestID, Payload: respPayload})

			joinPayload, _ := json.Marshal(map[string]any{
				"feed_id": screenFeedID,
				"display": screenDisplay,
			})
			h.webrtc.ForEach(func(other *webrtcConn) {
				if other.RoomID != conn.RoomID || other.ID == conn.ID {
					return
				}
				other.SendWS(wsEnvelope{Type: "publisher_joined", Payload: joinPayload})
			})

		case "subscribe":
			var payload struct {
				FeedID string `json:"feed_id"`
			}
			if err := json.Unmarshal(msg.Payload, &payload); err != nil || payload.FeedID == "" {
				conn.SendWS(wsEnvelope{Type: "error", RequestID: msg.RequestID, Payload: []byte(`{"message":"invalid payload"}`)})
				continue
			}

			logger.Info("webrtc ws subscribe",
				slog.String("user_id", userID),
				slog.String("connection_id", connectionID),
				slog.String("room_id", conn.RoomID),
				slog.String("feed_id", payload.FeedID),
			)

			ctxReq, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			subHandleID, err := h.janus.AttachSubscriber(ctxReq, conn.JanusSessionID)
			if err != nil {
				cancel()
				logger.Error("webrtc ws attach subscriber failed",
					slog.String("user_id", userID),
					slog.String("connection_id", connectionID),
					slog.String("room_id", conn.RoomID),
					slog.String("feed_id", payload.FeedID),
					slog.String("err", err.Error()),
				)
				conn.SendWS(wsEnvelope{Type: "error", RequestID: msg.RequestID, Payload: []byte(`{"message":"attach subscriber failed"}`)})
				continue
			}
			logger.Info("webrtc ws subscribe attached",
				slog.String("user_id", userID),
				slog.String("connection_id", connectionID),
				slog.String("room_id", conn.RoomID),
				slog.String("feed_id", payload.FeedID),
				slog.Int64("handle_id", subHandleID),
			)

			offer, err := h.janus.JoinSubscriber(ctxReq, conn.JanusSessionID, subHandleID, conn.RoomID, payload.FeedID)
			if err != nil {
				// Room might not exist yet (race), attempt to create it and retry.
				var vrErr *janus.VideoroomError
				if errors.As(err, &vrErr) && vrErr.Code == 426 {
					logger.Info("webrtc ws subscribe: janus room missing, creating",
						slog.String("user_id", userID),
						slog.String("connection_id", connectionID),
						slog.String("room_id", conn.RoomID),
						slog.String("feed_id", payload.FeedID),
						slog.Int("janus_code", vrErr.Code),
					)
					if ensureErr := h.janus.EnsureRoom(ctxReq, conn.JanusSessionID, conn.PublisherHandleID, conn.RoomID); ensureErr == nil {
						offer, err = h.janus.JoinSubscriber(ctxReq, conn.JanusSessionID, subHandleID, conn.RoomID, payload.FeedID)
					} else {
						err = ensureErr
					}
				}
			}
			cancel()
			if err != nil {
				_ = h.janus.Detach(context.Background(), conn.JanusSessionID, subHandleID)
				logger.Error("webrtc ws subscribe failed",
					slog.String("user_id", userID),
					slog.String("connection_id", connectionID),
					slog.String("room_id", conn.RoomID),
					slog.String("feed_id", payload.FeedID),
					slog.String("err", err.Error()),
				)
				payloadErr, _ := json.Marshal(map[string]any{
					"message": "subscribe failed",
					"err":     err.Error(),
				})
				conn.SendWS(wsEnvelope{Type: "error", RequestID: msg.RequestID, Payload: payloadErr})
				continue
			}

			conn.mu.Lock()
			conn.SubscriberHandlesByFeed[payload.FeedID] = subHandleID
			conn.mu.Unlock()

			respPayload, _ := json.Marshal(map[string]any{
				"feed_id": payload.FeedID,
				"jsep": map[string]any{
					"type": offer.Type,
					"sdp":  offer.SDP,
				},
			})
			conn.SendWS(wsEnvelope{Type: "subscribe_offer", RequestID: msg.RequestID, Payload: respPayload})
			logger.Info("webrtc ws subscribe offer sent",
				slog.String("user_id", userID),
				slog.String("connection_id", connectionID),
				slog.String("room_id", conn.RoomID),
				slog.String("feed_id", payload.FeedID),
			)

		case "subscribe_answer":
			var payload struct {
				FeedID string `json:"feed_id"`
				JSEP   struct {
					Type string `json:"type"`
					SDP  string `json:"sdp"`
				} `json:"jsep"`
			}
			if err := json.Unmarshal(msg.Payload, &payload); err != nil || payload.FeedID == "" {
				conn.SendWS(wsEnvelope{Type: "error", RequestID: msg.RequestID, Payload: []byte(`{"message":"invalid payload"}`)})
				continue
			}

			conn.mu.Lock()
			subHandleID := conn.SubscriberHandlesByFeed[payload.FeedID]
			conn.mu.Unlock()
			if subHandleID == 0 {
				conn.SendWS(wsEnvelope{Type: "error", RequestID: msg.RequestID, Payload: []byte(`{"message":"unknown feed"}`)})
				continue
			}

			ctxReq, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			err := h.janus.StartSubscriber(ctxReq, conn.JanusSessionID, subHandleID, service.JanusJSEP{Type: payload.JSEP.Type, SDP: payload.JSEP.SDP})
			cancel()
			if err != nil {
				logger.Error("webrtc ws start subscriber failed",
					slog.String("user_id", userID),
					slog.String("connection_id", connectionID),
					slog.String("feed_id", payload.FeedID),
					slog.String("err", err.Error()),
				)
				conn.SendWS(wsEnvelope{Type: "error", RequestID: msg.RequestID, Payload: []byte(`{"message":"start subscriber failed"}`)})
				continue
			}
			conn.SendWS(wsEnvelope{Type: "subscribe_answer_ack", RequestID: msg.RequestID})

		case "trickle":
			var payload struct {
				Target    string          `json:"target"`
				FeedID    string          `json:"feed_id,omitempty"`
				Candidate json.RawMessage `json:"candidate"`
			}
			if err := json.Unmarshal(msg.Payload, &payload); err != nil || len(payload.Candidate) == 0 {
				conn.SendWS(wsEnvelope{Type: "error", RequestID: msg.RequestID, Payload: []byte(`{"message":"invalid payload"}`)})
				continue
			}

			handleID := conn.PublisherHandleID
			switch payload.Target {
			case "subscriber":
				conn.mu.Lock()
				handleID = conn.SubscriberHandlesByFeed[payload.FeedID]
				conn.mu.Unlock()
			case "screen_publisher":
				handleID = conn.ScreenHandleID
			}
			if handleID == 0 {
				conn.SendWS(wsEnvelope{Type: "error", RequestID: msg.RequestID, Payload: []byte(`{"message":"unknown target"}`)})
				continue
			}

			ctxReq, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			err := h.janus.Trickle(ctxReq, conn.JanusSessionID, handleID, payload.Candidate)
			cancel()
			if err != nil {
				logger.Error("webrtc ws trickle failed",
					slog.String("user_id", userID),
					slog.String("connection_id", connectionID),
					slog.String("target", payload.Target),
					slog.String("feed_id", payload.FeedID),
					slog.String("err", err.Error()),
				)
				conn.SendWS(wsEnvelope{Type: "error", RequestID: msg.RequestID, Payload: []byte(`{"message":"trickle failed"}`)})
				continue
			}
			conn.SendWS(wsEnvelope{Type: "trickle_ack", RequestID: msg.RequestID})

		case "screen_leave":
			conn.mu.Lock()
			screenHandleID := conn.ScreenHandleID
			conn.ScreenHandleID = 0
			conn.ScreenFeedID = ""
			conn.mu.Unlock()
			if screenHandleID != 0 {
				ctxReq, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				_ = h.janus.Detach(ctxReq, conn.JanusSessionID, screenHandleID)
				cancel()
			}
			conn.SendWS(wsEnvelope{Type: "screen_leave_ack", RequestID: msg.RequestID})
		case "leave":
			_ = c.Close()
			return
		}
	}

	// Cleanup on disconnect.
	logger.Info("webrtc ws disconnected",
		slog.String("user_id", userID),
		slog.String("connection_id", connectionID),
		slog.String("channel_id", conn.ChannelID),
		slog.Int64("janus_session_id", conn.JanusSessionID),
	)
	cancelCtx()
	<-keepaliveDone
	h.webrtc.Delete(connectionID)
	_ = h.janus.DestroySession(context.Background(), conn.JanusSessionID)
}
