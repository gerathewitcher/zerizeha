package janus

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"zerizeha/pkg/logger"
)

var ErrClosed = errors.New("janus client is closed")

type JanusClient struct {
	url string

	writeMu sync.Mutex

	pendingMu sync.Mutex
	pending   map[string]chan Message

	subMu sync.Mutex
	subs  map[string]chan Message

	closeOnce sync.Once
	closed    chan struct{}

	connMu sync.Mutex
	conn   *websocket.Conn
}

func NewJanusClient(janusWSURL string) *JanusClient {
	return &JanusClient{
		url:     janusWSURL,
		pending: make(map[string]chan Message),
		subs:    make(map[string]chan Message),
		closed:  make(chan struct{}),
	}
}

func (c *JanusClient) Connect(ctx context.Context) error {
	c.connMu.Lock()
	if c.conn != nil {
		c.connMu.Unlock()
		return nil
	}
	c.connMu.Unlock()

	u, err := url.Parse(c.url)
	if err != nil {
		return err
	}
	if u.Scheme != "ws" && u.Scheme != "wss" {
		return fmt.Errorf("invalid janus ws url scheme: %s", u.Scheme)
	}

	d := websocket.Dialer{
		Proxy:            http.ProxyFromEnvironment,
		HandshakeTimeout: 10 * time.Second,
		Subprotocols:     []string{"janus-protocol"},
	}

	conn, _, err := d.DialContext(ctx, u.String(), nil)
	if err != nil {
		logger.Error("janus ws dial failed", slog.String("err", err.Error()))
		return err
	}

	c.connMu.Lock()
	c.conn = conn
	c.connMu.Unlock()

	logger.Info("janus ws connected", slog.String("url", u.String()))
	go c.readLoop()
	return nil
}

func (c *JanusClient) Close() error {
	c.closeOnce.Do(func() {
		close(c.closed)

		c.connMu.Lock()
		conn := c.conn
		c.conn = nil
		c.connMu.Unlock()

		if conn != nil {
			_ = conn.Close()
		}

		logger.Info("janus ws closed")

		c.pendingMu.Lock()
		for tx, ch := range c.pending {
			close(ch)
			delete(c.pending, tx)
		}
		c.pendingMu.Unlock()

		c.subMu.Lock()
		for id, ch := range c.subs {
			close(ch)
			delete(c.subs, id)
		}
		c.subMu.Unlock()
	})
	return nil
}

func (c *JanusClient) Subscribe(buffer int) (<-chan Message, func()) {
	if buffer <= 0 {
		buffer = 256
	}
	id := newTx()
	ch := make(chan Message, buffer)
	c.subMu.Lock()
	c.subs[id] = ch
	c.subMu.Unlock()

	cancel := func() {
		c.subMu.Lock()
		if existing, ok := c.subs[id]; ok {
			close(existing)
			delete(c.subs, id)
		}
		c.subMu.Unlock()
	}
	return ch, cancel
}

func (c *JanusClient) Send(ctx context.Context, req Message) (Message, error) {
	select {
	case <-c.closed:
		return Message{}, ErrClosed
	default:
	}

	if err := c.Connect(ctx); err != nil {
		return Message{}, err
	}

	if req.Transaction == "" {
		req.Transaction = newTx()
	}
	tx := req.Transaction

	wait := make(chan Message, 1)
	c.pendingMu.Lock()
	if _, exists := c.pending[tx]; exists {
		c.pendingMu.Unlock()
		return Message{}, fmt.Errorf("duplicate transaction: %s", tx)
	}
	c.pending[tx] = wait
	c.pendingMu.Unlock()

	if err := c.writeJSON(req); err != nil {
		c.pendingMu.Lock()
		delete(c.pending, tx)
		c.pendingMu.Unlock()
		return Message{}, err
	}

	select {
	case resp, ok := <-wait:
		c.pendingMu.Lock()
		delete(c.pending, tx)
		c.pendingMu.Unlock()
		if !ok {
			return Message{}, ErrClosed
		}
		return resp, nil
	case <-ctx.Done():
		c.pendingMu.Lock()
		delete(c.pending, tx)
		c.pendingMu.Unlock()
		return Message{}, ctx.Err()
	case <-c.closed:
		return Message{}, ErrClosed
	}
}

func (c *JanusClient) writeJSON(v any) error {
	c.connMu.Lock()
	conn := c.conn
	c.connMu.Unlock()
	if conn == nil {
		return ErrClosed
	}

	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	return conn.WriteJSON(v)
}

func (c *JanusClient) readLoop() {
	defer func() {
		_ = c.Close()
	}()

	c.connMu.Lock()
	conn := c.conn
	c.connMu.Unlock()
	if conn == nil {
		return
	}

	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			logger.Warn("janus ws read failed", slog.String("err", err.Error()))
			return
		}

		var msg Message
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}

		// Route responses by transaction; everything else goes to events.
		if msg.Transaction != "" {
			c.pendingMu.Lock()
			ch := c.pending[msg.Transaction]
			c.pendingMu.Unlock()
			if ch != nil {
				select {
				case ch <- msg:
				default:
				}
			}
		}

		c.subMu.Lock()
		for _, sub := range c.subs {
			select {
			case sub <- msg:
			default:
				// drop if overloaded
			}
		}
		c.subMu.Unlock()
	}
}
