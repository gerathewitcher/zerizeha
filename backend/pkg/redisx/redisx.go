package redisx

import (
	"context"

	"github.com/redis/go-redis/v9"
)

func New(addr string) *redis.Client {
	return redis.NewClient(&redis.Options{
		Addr: addr,
	})
}

func Ping(ctx context.Context, client *redis.Client) error {
	return client.Ping(ctx).Err()
}
