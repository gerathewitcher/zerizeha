package handler

import (
	"sync"
	"time"

	"github.com/google/uuid"

	"zerizeha/internal/service"
)

type webrtcConn struct {
	mu sync.Mutex

	ID        string
	UserID    string
	ChannelID string
	RoomID    string
	Display   string
	CreatedAt time.Time

	JanusSessionID          int64
	PublisherHandleID       int64
	PublisherFeedID         string
	KnownPublishers         []service.JanusPublisher
	SubscriberHandlesByFeed map[string]int64
}

type webrtcStore struct {
	mu    sync.RWMutex
	conns map[string]*webrtcConn
}

func newWebRTCStore() *webrtcStore {
	return &webrtcStore{conns: make(map[string]*webrtcConn)}
}

func (s *webrtcStore) New(conn webrtcConn) *webrtcConn {
	s.mu.Lock()
	defer s.mu.Unlock()

	if conn.ID == "" {
		conn.ID = uuid.NewString()
	}
	if conn.CreatedAt.IsZero() {
		conn.CreatedAt = time.Now()
	}
	if conn.SubscriberHandlesByFeed == nil {
		conn.SubscriberHandlesByFeed = make(map[string]int64)
	}

	c := conn
	s.conns[c.ID] = &c
	return &c
}

func (s *webrtcStore) Get(id string) (*webrtcConn, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	conn, ok := s.conns[id]
	return conn, ok
}

func (s *webrtcStore) Delete(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.conns, id)
}
