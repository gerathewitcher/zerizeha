package handler

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gofiber/fiber/v2"

	api "zerizeha/internal/api"
	"zerizeha/internal/dto"
)

// ListChannelMessages returns a page of channel chat messages using keyset pagination.
func (h *Handler) ListChannelMessages(c *fiber.Ctx, id string, params api.ListChannelMessagesParams) error {
	userID, ok := c.Locals(UserIDLocalKey).(string)
	if !ok || userID == "" {
		return writeHTTPError(c, http.StatusUnauthorized, "unauthorized")
	}

	channel, err := h.ensureChannelChatAccess(c, id, userID)
	if err != nil {
		return err
	}

	limit := 50
	if params.Limit != nil && *params.Limit > 0 && *params.Limit <= 100 {
		limit = *params.Limit
	}

	var cursor *dto.ChannelMessageCursor
	if params.Cursor != nil && strings.TrimSpace(*params.Cursor) != "" {
		parsed, err := decodeChannelMessageCursor(*params.Cursor)
		if err != nil {
			return writeHTTPError(c, http.StatusBadRequest, "invalid cursor")
		}
		cursor = parsed
	}

	messages, next, err := h.chat.ListChannelMessages(channel.ID, limit, cursor)
	if err != nil {
		return writeError(c, err)
	}

	var nextCursor *string
	if next != nil {
		encoded := encodeChannelMessageCursor(*next)
		nextCursor = &encoded
	}

	return c.JSON(api.ChannelMessagesPage{
		Items:      toAPIChannelMessages(messages),
		NextCursor: nextCursor,
	})
}

// CreateChannelMessage stores a new message in a channel chat and emits a realtime event to space members.
func (h *Handler) CreateChannelMessage(c *fiber.Ctx, id string) error {
	userID, ok := c.Locals(UserIDLocalKey).(string)
	if !ok || userID == "" {
		return writeHTTPError(c, http.StatusUnauthorized, "unauthorized")
	}

	channel, err := h.ensureChannelChatAccess(c, id, userID)
	if err != nil {
		return err
	}

	var body api.CreateChannelMessageJSONRequestBody
	if err := c.BodyParser(&body); err != nil {
		return writeHTTPError(c, http.StatusBadRequest, "invalid request body")
	}

	messageBody := strings.TrimSpace(body.Body)
	if messageBody == "" {
		return writeHTTPError(c, http.StatusBadRequest, "message body is required")
	}

	messageID, err := h.chat.CreateChannelMessage(dto.ChannelMessageToCreate{
		ChannelID: channel.ID,
		AuthorID:  userID,
		Body:      messageBody,
	})
	if err != nil {
		return writeError(c, err)
	}

	return c.JSON(api.IdResponse{Id: messageID})
}

func (h *Handler) ensureChannelChatAccess(c *fiber.Ctx, channelID string, userID string) (dto.Channel, error) {
	channel, err := h.space.GetChannelByID(channelID)
	if err != nil {
		return dto.Channel{}, writeError(c, err)
	}
	switch channel.ChannelType {
	case "text", "voice":
	default:
		return dto.Channel{}, writeHTTPError(c, http.StatusBadRequest, "channel chat is not supported")
	}

	isMember, err := h.space.IsSpaceMember(channel.SpaceID, userID)
	if err != nil {
		return dto.Channel{}, writeError(c, err)
	}
	if !isMember {
		return dto.Channel{}, writeHTTPError(c, http.StatusForbidden, "forbidden")
	}

	return channel, nil
}

func toAPIChannelMessages(messages []dto.ChannelMessage) []api.ChannelMessage {
	items := make([]api.ChannelMessage, 0, len(messages))
	for _, message := range messages {
		items = append(items, toAPIChannelMessage(message))
	}
	return items
}

func toAPIChannelMessage(message dto.ChannelMessage) api.ChannelMessage {
	return api.ChannelMessage{
		Id:        message.ID,
		ChannelId: message.ChannelID,
		AuthorId:  message.AuthorID,
		Body:      message.Body,
		CreatedAt: message.CreatedAt,
		Author: api.ChannelMessageAuthor{
			Id:       message.Author.ID,
			Username: message.Author.Username,
			IsAdmin:  message.Author.IsAdmin,
		},
	}
}

func encodeChannelMessageCursor(cursor dto.ChannelMessageCursor) string {
	payload, _ := json.Marshal(cursor)
	return base64.RawURLEncoding.EncodeToString(payload)
}

func decodeChannelMessageCursor(encoded string) (*dto.ChannelMessageCursor, error) {
	raw, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return nil, err
	}

	var cursor dto.ChannelMessageCursor
	if err := json.Unmarshal(raw, &cursor); err != nil {
		return nil, err
	}

	return &cursor, nil
}
