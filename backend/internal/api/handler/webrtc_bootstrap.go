package handler

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	api "zerizeha/internal/api"
	janus "zerizeha/internal/service/janus"
	"zerizeha/pkg/logger"
)

func (h *Handler) VoiceWebRTCBootstrap(c *fiber.Ctx, id string) error {
	userID, ok := c.Locals(UserIDLocalKey).(string)
	if !ok || userID == "" {
		return writeHTTPError(c, http.StatusUnauthorized, "unauthorized")
	}

	// Fiber path params may reference reused request buffers; clone to safely store in memory.
	channelID := strings.Clone(id)

	logger.Info("webrtc bootstrap start",
		slog.String("user_id", userID),
		slog.String("channel_id", channelID),
	)

	if strings.TrimSpace(h.cfg.JanusWSURL()) == "" {
		logger.Warn("webrtc bootstrap: janus not configured",
			slog.String("user_id", userID),
			slog.String("channel_id", id),
		)
		return writeHTTPError(c, http.StatusNotImplemented, "janus is not configured")
	}

	channel, err := h.space.GetChannelByID(channelID)
	if err != nil {
		return writeError(c, err)
	}
	if channel.ChannelType != "voice" {
		return writeHTTPError(c, http.StatusBadRequest, "channel is not voice")
	}

	isMember, err := h.space.IsSpaceMember(channel.SpaceID, userID)
	if err != nil {
		return writeError(c, err)
	}
	if !isMember {
		return writeHTTPError(c, http.StatusForbidden, "forbidden")
	}

	ctx, cancel := context.WithTimeout(c.UserContext(), 12*time.Second)
	defer cancel()

	sessionID, err := h.janus.CreateSession(ctx)
	if err != nil {
		logger.Error("webrtc bootstrap: create session failed",
			slog.String("user_id", userID),
			slog.String("channel_id", id),
			slog.String("err", err.Error()),
		)
		return writeError(c, err)
	}
	logger.Info("webrtc bootstrap: session created",
		slog.String("user_id", userID),
		slog.String("channel_id", channelID),
		slog.Int64("janus_session_id", sessionID),
	)

	pubHandleID, err := h.janus.AttachVideoroom(ctx, sessionID)
	if err != nil {
		logger.Error("webrtc bootstrap: attach videoroom failed",
			slog.String("user_id", userID),
			slog.String("channel_id", channelID),
			slog.Int64("janus_session_id", sessionID),
			slog.String("err", err.Error()),
		)
		_ = h.janus.DestroySession(context.Background(), sessionID)
		return writeError(c, err)
	}
	logger.Info("webrtc bootstrap: videoroom attached",
		slog.String("user_id", userID),
		slog.String("channel_id", channelID),
		slog.Int64("janus_session_id", sessionID),
		slog.Int64("publisher_handle_id", pubHandleID),
	)

	if err := h.janus.EnsureRoom(ctx, sessionID, pubHandleID, channelID); err != nil {
		logger.Error("webrtc bootstrap: ensure room failed",
			slog.String("user_id", userID),
			slog.String("channel_id", channelID),
			slog.Int64("janus_session_id", sessionID),
			slog.Int64("publisher_handle_id", pubHandleID),
			slog.String("err", err.Error()),
		)
		_ = h.janus.DestroySession(context.Background(), sessionID)
		return writeError(c, err)
	}

	// Use userID as display so frontend can map publisher feed to user.
	selfFeedID, publishers, err := h.janus.JoinPublisher(ctx, sessionID, pubHandleID, channelID, userID)
	if err != nil {
		var vrErr *janus.VideoroomError
		if errors.As(err, &vrErr) && vrErr.Code == 426 {
			selfFeedID, publishers, err = h.janus.JoinPublisher(ctx, sessionID, pubHandleID, channelID, userID)
		}
		if err != nil {
			logger.Error("webrtc bootstrap: join publisher failed",
				slog.String("user_id", userID),
				slog.String("channel_id", channelID),
				slog.Int64("janus_session_id", sessionID),
				slog.Int64("publisher_handle_id", pubHandleID),
				slog.String("err", err.Error()),
			)
			_ = h.janus.DestroySession(context.Background(), sessionID)
			return writeError(c, err)
		}
	}

	conn := h.webrtc.New(webrtcConn{
		UserID:            userID,
		ChannelID:         channelID,
		RoomID:            channelID,
		Display:           userID,
		JanusSessionID:    sessionID,
		PublisherHandleID: pubHandleID,
		PublisherFeedID:   selfFeedID,
		KnownPublishers:   publishers,
	})

	items := make([]api.WebRTCPublisher, 0, len(publishers))
	for _, p := range publishers {
		feed := p.FeedID
		display := p.Display
		items = append(items, api.WebRTCPublisher{FeedId: feed, Display: &display})
	}

	logger.Info("webrtc bootstrap ok",
		slog.String("user_id", userID),
		slog.String("channel_id", channelID),
		slog.String("connection_id", conn.ID),
		slog.Int64("janus_session_id", sessionID),
		slog.Int64("publisher_handle_id", pubHandleID),
		slog.String("self_feed_id", selfFeedID),
		slog.Int("publishers_count", len(publishers)),
	)

	return c.JSON(api.WebRTCBootstrapResponse{
		ConnectionId: conn.ID,
		RoomId:       channelID,
		SelfFeedId:   selfFeedID,
		Publishers:   items,
	})
}
