package handler

import (
	"sync"
	"time"

	"github.com/gofiber/contrib/websocket"
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
	ScreenHandleID          int64
	ScreenFeedID            string
	KnownPublishers         []service.JanusPublisher
	SubscriberHandlesByFeed map[string]int64

	wsMu sync.Mutex
	ws   *websocket.Conn
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

func (s *webrtcStore) ForEach(fn func(*webrtcConn)) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, conn := range s.conns {
		fn(conn)
	}
}

func (s *webrtcStore) Delete(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.conns, id)
}

func (c *webrtcConn) SetWS(conn *websocket.Conn) {
	c.wsMu.Lock()
	c.ws = conn
	c.wsMu.Unlock()
}

func (c *webrtcConn) ClearWS() {
	c.wsMu.Lock()
	c.ws = nil
	c.wsMu.Unlock()
}

func (c *webrtcConn) SendWS(msg wsEnvelope) {
	c.wsMu.Lock()
	defer c.wsMu.Unlock()
	if c.ws == nil {
		return
	}
	_ = writeWS(c.ws, msg)
}
