package handler

import (
	"encoding/json"
	"net/http"

	"github.com/gofiber/fiber/v2"

	api "zerizeha/internal/api"
	"zerizeha/internal/service"
)

func (h *Handler) JoinVoiceChannel(c *fiber.Ctx, id string) error {
	userID, ok := c.Locals(UserIDLocalKey).(string)
	if !ok || userID == "" {
		return writeHTTPError(c, http.StatusUnauthorized, "unauthorized")
	}

	channel, err := h.space.GetChannelByID(id)
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

	prevChannelID, _ := h.voice.GetUserChannelID(c.UserContext(), userID)
	if err := h.voice.Join(c.UserContext(), userID, id); err != nil {
		return writeError(c, err)
	}

	// Push updates (replace polling).
	if prevChannelID != "" && prevChannelID != id {
		h.broadcastVoiceChannelMembers(channel.SpaceID, prevChannelID)
	}
	h.broadcastVoiceChannelMembers(channel.SpaceID, id)

	return c.SendStatus(http.StatusNoContent)
}

func (h *Handler) LeaveVoice(c *fiber.Ctx) error {
	userID, ok := c.Locals(UserIDLocalKey).(string)
	if !ok || userID == "" {
		return writeHTTPError(c, http.StatusUnauthorized, "unauthorized")
	}

	prevChannelID, _ := h.voice.GetUserChannelID(c.UserContext(), userID)
	if err := h.voice.Leave(c.UserContext(), userID); err != nil {
		return writeError(c, err)
	}

	if prevChannelID != "" {
		// Best-effort: resolve space id and broadcast.
		if ch, err := h.space.GetChannelByID(prevChannelID); err == nil {
			h.broadcastVoiceChannelMembers(ch.SpaceID, prevChannelID)
		}
	}

	return c.SendStatus(http.StatusNoContent)
}

func (h *Handler) VoiceHeartbeat(c *fiber.Ctx) error {
	userID, ok := c.Locals(UserIDLocalKey).(string)
	if !ok || userID == "" {
		return writeHTTPError(c, http.StatusUnauthorized, "unauthorized")
	}

	if err := h.voice.Heartbeat(c.UserContext(), userID); err != nil {
		return writeError(c, err)
	}

	return c.SendStatus(http.StatusNoContent)
}

func (h *Handler) ListVoiceMembers(c *fiber.Ctx, id string) error {
	userID, ok := c.Locals(UserIDLocalKey).(string)
	if !ok || userID == "" {
		return writeHTTPError(c, http.StatusUnauthorized, "unauthorized")
	}

	channel, err := h.space.GetChannelByID(id)
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

	ids, err := h.voice.ListMemberIDs(c.UserContext(), id)
	if err != nil {
		return writeError(c, err)
	}

	users, err := h.user.GetUsersByIDs(ids)
	if err != nil {
		return writeError(c, err)
	}
	states, _ := h.voice.GetUserStates(c.UserContext(), ids)

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

	result := make([]api.VoiceMember, 0, len(ids))
	for _, uid := range ids {
		info, ok := userByID[uid]
		if !ok {
			continue
		}
		state := states[uid]
		result = append(result, api.VoiceMember{
			Id:       uid,
			Username: info.username,
			IsAdmin:  info.isAdmin,
			Muted:    state.Muted,
			Deafened: state.Deafened,
		})
	}

	return c.JSON(result)
}

type voiceStateRequest struct {
	Muted    bool `json:"muted"`
	Deafened bool `json:"deafened"`
}

func (h *Handler) UpdateVoiceState(c *fiber.Ctx) error {
	userID, ok := c.Locals(UserIDLocalKey).(string)
	if !ok || userID == "" {
		return writeHTTPError(c, http.StatusUnauthorized, "unauthorized")
	}

	var payload voiceStateRequest
	if err := json.Unmarshal(c.Body(), &payload); err != nil {
		return writeHTTPError(c, http.StatusBadRequest, "invalid payload")
	}

	if err := h.voice.SetUserState(c.UserContext(), userID, service.VoiceState{
		Muted:    payload.Muted,
		Deafened: payload.Deafened,
	}); err != nil {
		return writeError(c, err)
	}

	channelID, _ := h.voice.GetUserChannelID(c.UserContext(), userID)
	if channelID != "" {
		if ch, err := h.space.GetChannelByID(channelID); err == nil {
			h.broadcastVoiceChannelMembers(ch.SpaceID, channelID)
		}
	}

	return c.SendStatus(http.StatusNoContent)
}
