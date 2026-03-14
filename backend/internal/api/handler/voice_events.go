package handler

import (
	"context"
	"encoding/json"

	api "zerizeha/internal/api"
	"zerizeha/internal/dto"
)

func (h *Handler) sendInitialVoiceSnapshots(userID string, conn *eventsWSConn) error {
	spaces, err := h.space.ListSpacesByUser(userID)
	if err != nil {
		return err
	}

	for _, space := range spaces {
		payload, err := h.buildVoicePresenceSnapshot(context.Background(), space.ID)
		if err != nil {
			return err
		}
		if err := writeWS(conn.ws, wsEnvelope{Type: "voice.snapshot", Payload: payload}); err != nil {
			return err
		}
	}

	return nil
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

		members, err := h.buildVoiceMembers(ctx, ch.ID)
		if err != nil {
			return nil, err
		}
		result[ch.ID] = members
	}

	return json.Marshal(map[string]any{
		"space_id":                    spaceID,
		"voice_members_by_channel_id": result,
	})
}

func (h *Handler) broadcastVoiceChannelMembers(spaceID string, channelID string) {
	payload, err := h.buildVoiceChannelMembersPayload(context.Background(), spaceID, channelID)
	if err != nil {
		return
	}

	members, err := h.space.ListSpaceMembers(spaceID)
	if err != nil {
		return
	}

	h.eventsHub.SendToUsers(uniqueSpaceMemberUserIDs(members), wsEnvelope{
		Type:    "voice.channel_members",
		Payload: payload,
	})
}

func (h *Handler) buildVoiceChannelMembersPayload(ctx context.Context, spaceID string, channelID string) ([]byte, error) {
	members, err := h.buildVoiceMembers(ctx, channelID)
	if err != nil {
		return nil, err
	}

	return json.Marshal(map[string]any{
		"space_id":   spaceID,
		"channel_id": channelID,
		"members":    members,
	})
}

func (h *Handler) buildVoiceMembers(ctx context.Context, channelID string) ([]api.VoiceMember, error) {
	ids, err := h.voice.ListMemberIDs(ctx, channelID)
	if err != nil {
		return nil, err
	}

	users, err := h.user.GetUsersByIDs(ids)
	if err != nil {
		return nil, err
	}
	states, _ := h.voice.GetUserStates(ctx, ids)

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
		state := states[uid]
		members = append(members, api.VoiceMember{
			Id:       uid,
			Username: info.username,
			IsAdmin:  info.isAdmin,
			Muted:    state.Muted,
			Deafened: state.Deafened,
		})
	}

	return members, nil
}

func uniqueSpaceMemberUserIDs(members []dto.SpaceMemberWithUser) []string {
	userIDs := make([]string, 0, len(members))
	seen := make(map[string]struct{}, len(members))
	for _, member := range members {
		if _, ok := seen[member.UserID]; ok {
			continue
		}
		seen[member.UserID] = struct{}{}
		userIDs = append(userIDs, member.UserID)
	}
	return userIDs
}
