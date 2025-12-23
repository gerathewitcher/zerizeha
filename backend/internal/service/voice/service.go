package voice

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	"zerizeha/internal/service"
)

type serv struct {
	redis *redis.Client
	ttl   time.Duration
}

func New(redisClient *redis.Client, ttlSeconds int) service.VoiceService {
	ttl := 45 * time.Second
	if ttlSeconds > 0 {
		ttl = time.Duration(ttlSeconds) * time.Second
	}
	return &serv{redis: redisClient, ttl: ttl}
}

func (s *serv) Join(ctx context.Context, userID string, channelID string) error {
	if userID == "" || channelID == "" {
		return fmt.Errorf("userID and channelID are required")
	}

	joinedAt := time.Now().UnixMilli()
	userKey := voiceUserChannelKey(userID)

	prev, err := s.redis.Get(ctx, userKey).Result()
	if err != nil && err != redis.Nil {
		return err
	}

	pipe := s.redis.Pipeline()
	if prev != "" && prev != channelID {
		pipe.ZRem(ctx, voiceChannelMembersKey(prev), userID)
	}
	pipe.Set(ctx, userKey, channelID, s.ttl)
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
	prev, err := s.redis.Get(ctx, userKey).Result()
	if err != nil && err != redis.Nil {
		return err
	}
	if prev == "" {
		return nil
	}

	pipe := s.redis.Pipeline()
	pipe.Del(ctx, userKey)
	pipe.ZRem(ctx, voiceChannelMembersKey(prev), userID)
	_, err = pipe.Exec(ctx)
	return err
}

func (s *serv) Heartbeat(ctx context.Context, userID string) error {
	if userID == "" {
		return fmt.Errorf("userID is required")
	}

	userKey := voiceUserChannelKey(userID)
	// Heartbeat only extends user presence TTL; it must NOT affect the ordering in channel members ZSET.
	// Ordering is based on join timestamp.
	if err := s.redis.Expire(ctx, userKey, s.ttl).Err(); err != nil && err != redis.Nil {
		return err
	}
	return nil
}

func (s *serv) ListMemberIDs(ctx context.Context, channelID string) ([]string, error) {
	if channelID == "" {
		return nil, fmt.Errorf("channelID is required")
	}

	key := voiceChannelMembersKey(channelID)

	ids, err := s.redis.ZRange(ctx, key, 0, -1).Result()
	if err != nil && err != redis.Nil {
		return nil, err
	}

	if len(ids) == 0 {
		return ids, nil
	}

	// Cleanup: drop stale members by verifying they still "point" to this channel.
	// Optimized to 3 redis calls: ZRANGE + MGET + ZREM.
	userKeys := make([]string, 0, len(ids))
	for _, userID := range ids {
		userKeys = append(userKeys, voiceUserChannelKey(userID))
	}

	values, err := s.redis.MGet(ctx, userKeys...).Result()
	if err != nil && err != redis.Nil {
		return nil, err
	}

	active := make([]string, 0, len(ids))
	var stale []interface{}
	for idx, userID := range ids {
		if idx >= len(values) {
			stale = append(stale, userID)
			continue
		}

		raw := values[idx]
		value, ok := raw.(string)
		if !ok || value == "" || value != channelID {
			stale = append(stale, userID)
			continue
		}
		active = append(active, userID)
	}

	if len(stale) > 0 {
		_ = s.redis.ZRem(ctx, key, stale...).Err()
	}

	return active, nil
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

func voiceUserChannelKey(userID string) string {
	return fmt.Sprintf("voice:user:%s:channel", userID)
}

func voiceChannelMembersKey(channelID string) string {
	return fmt.Sprintf("voice:channel:%s:members", channelID)
}
