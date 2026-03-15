package voice

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	"zerizeha/internal/service"
)

type serv struct {
	redis *redis.Client
	ttl   time.Duration
}

// New creates a voice presence service backed by Redis.
func New(
	redisClient *redis.Client,
	ttlSeconds int,
) service.VoiceService {
	ttl := 45 * time.Second
	if ttlSeconds > 0 {
		ttl = time.Duration(ttlSeconds) * time.Second
	}
	return &serv{
		redis: redisClient,
		ttl:   ttl,
	}
}

func (s *serv) Join(ctx context.Context, userID string, channelID string) error {
	if userID == "" || channelID == "" {
		return fmt.Errorf("userID and channelID are required")
	}

	joinedAt := time.Now().UnixMilli()
	userKey := voiceUserChannelKey(userID)
	stateKey := voiceUserStateKey(userID)

	prev, err := s.redis.Get(ctx, userKey).Result()
	if err != nil && err != redis.Nil {
		return err
	}

	statePayload, _ := json.Marshal(service.VoiceState{Muted: false, Deafened: false})
	pipe := s.redis.Pipeline()
	if prev != "" && prev != channelID {
		pipe.ZRem(ctx, voiceChannelMembersKey(prev), userID)
	}
	pipe.Set(ctx, userKey, channelID, s.ttl)
	pipe.Set(ctx, stateKey, statePayload, s.ttl)
	pipe.ZAdd(ctx, voiceChannelMembersKey(channelID), redis.Z{
		Score:  float64(joinedAt),
		Member: userID,
	})

	_, err = pipe.Exec(ctx)
	return err
}

func (s *serv) Leave(ctx context.Context, userID string) error {
	if userID == "" {
		return fmt.Errorf("userID is required")
	}

	userKey := voiceUserChannelKey(userID)
	stateKey := voiceUserStateKey(userID)
	prev, err := s.redis.Get(ctx, userKey).Result()
	if err != nil && err != redis.Nil {
		return err
	}
	if prev == "" {
		return nil
	}

	pipe := s.redis.Pipeline()
	pipe.Del(ctx, userKey)
	pipe.Del(ctx, stateKey)
	pipe.ZRem(ctx, voiceChannelMembersKey(prev), userID)
	_, err = pipe.Exec(ctx)
	return err
}

func (s *serv) Heartbeat(ctx context.Context, userID string) error {
	if userID == "" {
		return fmt.Errorf("userID is required")
	}

	userKey := voiceUserChannelKey(userID)
	stateKey := voiceUserStateKey(userID)
	// Heartbeat only extends user presence TTL; it must NOT affect the ordering in channel members ZSET.
	// Ordering is based on join timestamp.
	if err := s.redis.Expire(ctx, userKey, s.ttl).Err(); err != nil && err != redis.Nil {
		return err
	}
	_ = s.redis.Expire(ctx, stateKey, s.ttl).Err()
	return nil
}

func (s *serv) ListMemberIDs(ctx context.Context, channelID string) ([]string, error) {
	active, _, err := s.collectActiveMemberIDs(ctx, channelID)
	return active, err
}

// CleanupStaleMembers removes users whose presence keys no longer point to the
// provided channel from the channel members index.
func (s *serv) CleanupStaleMembers(ctx context.Context, channelID string) (bool, error) {
	_, cleaned, err := s.collectActiveMemberIDs(ctx, channelID)
	return cleaned, err
}

func (s *serv) collectActiveMemberIDs(ctx context.Context, channelID string) ([]string, bool, error) {
	if channelID == "" {
		return nil, false, fmt.Errorf("channelID is required")
	}

	key := voiceChannelMembersKey(channelID)

	ids, err := s.redis.ZRange(ctx, key, 0, -1).Result()
	if err != nil && err != redis.Nil {
		return nil, false, err
	}

	if len(ids) == 0 {
		return ids, false, nil
	}

	// Cleanup: drop stale members by verifying they still "point" to this channel.
	// Optimized to 3 redis calls: ZRANGE + MGET + ZREM.
	userKeys := make([]string, 0, len(ids))
	for _, userID := range ids {
		userKeys = append(userKeys, voiceUserChannelKey(userID))
	}

	values, err := s.redis.MGet(ctx, userKeys...).Result()
	if err != nil && err != redis.Nil {
		return nil, false, err
	}

	active := make([]string, 0, len(ids))
	var stale []any
	var staleStateKeys []string
	for idx, userID := range ids {
		if idx >= len(values) {
			stale = append(stale, userID)
			staleStateKeys = append(staleStateKeys, voiceUserStateKey(userID))
			continue
		}

		raw := values[idx]
		value, ok := raw.(string)
		if !ok || value == "" || value != channelID {
			stale = append(stale, userID)
			staleStateKeys = append(staleStateKeys, voiceUserStateKey(userID))
			continue
		}
		active = append(active, userID)
	}

	if len(stale) > 0 {
		_ = s.redis.ZRem(ctx, key, stale...).Err()
	}
	if len(staleStateKeys) > 0 {
		_ = s.redis.Del(ctx, staleStateKeys...).Err()
	}

	return active, len(stale) > 0, nil
}

func (s *serv) GetUserChannelID(ctx context.Context, userID string) (string, error) {
	if userID == "" {
		return "", fmt.Errorf("userID is required")
	}
	value, err := s.redis.Get(ctx, voiceUserChannelKey(userID)).Result()
	if err != nil && err != redis.Nil {
		return "", err
	}
	return value, nil
}

func (s *serv) SetUserState(ctx context.Context, userID string, state service.VoiceState) error {
	if userID == "" {
		return fmt.Errorf("userID is required")
	}
	payload, err := json.Marshal(state)
	if err != nil {
		return err
	}
	return s.redis.Set(ctx, voiceUserStateKey(userID), payload, s.ttl).Err()
}

func (s *serv) GetUserStates(ctx context.Context, userIDs []string) (map[string]service.VoiceState, error) {
	result := make(map[string]service.VoiceState, len(userIDs))
	if len(userIDs) == 0 {
		return result, nil
	}
	keys := make([]string, 0, len(userIDs))
	for _, id := range userIDs {
		keys = append(keys, voiceUserStateKey(id))
	}
	values, err := s.redis.MGet(ctx, keys...).Result()
	if err != nil && err != redis.Nil {
		return result, err
	}
	for idx, raw := range values {
		if idx >= len(userIDs) {
			break
		}
		userID := userIDs[idx]
		state := service.VoiceState{}
		if payload, ok := raw.(string); ok && payload != "" {
			_ = json.Unmarshal([]byte(payload), &state)
		}
		result[userID] = state
	}
	return result, nil
}

func voiceUserChannelKey(userID string) string {
	return fmt.Sprintf("voice:user:%s:channel", userID)
}

func voiceChannelMembersKey(channelID string) string {
	return fmt.Sprintf("voice:channel:%s:members", channelID)
}

func voiceUserStateKey(userID string) string {
	return fmt.Sprintf("voice:user:%s:state", userID)
}
