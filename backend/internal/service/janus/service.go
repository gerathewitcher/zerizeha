package janus

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"zerizeha/internal/service"
)

type Service struct {
	client *JanusClient
}

func New(janusWSURL string) service.JanusService {
	return &Service{client: NewJanusClient(janusWSURL)}
}

func (s *Service) Subscribe(buffer int) (<-chan Message, func()) {
	return s.client.Subscribe(buffer)
}

type VideoroomError struct {
	Code    int
	Message string
}

func (e *VideoroomError) Error() string {
	if e == nil {
		return "janus videoroom error"
	}
	return fmt.Sprintf("janus videoroom error: %d %s", e.Code, e.Message)
}

func (s *Service) CreateSession(ctx context.Context) (int64, error) {
	resp, err := s.client.Send(ctx, Message{Janus: "create"})
	if err != nil {
		return 0, err
	}
	if err := requireSuccess(resp); err != nil {
		return 0, err
	}
	if resp.Data == nil || resp.Data.ID == 0 {
		return 0, errors.New("janus create: missing session id")
	}
	return resp.Data.ID, nil
}

func (s *Service) KeepAlive(ctx context.Context, sessionID int64) error {
	resp, err := s.client.Send(ctx, Message{Janus: "keepalive", SessionID: sessionID})
	if err != nil {
		return err
	}
	return requireAckOrSuccess(resp)
}

func (s *Service) DestroySession(ctx context.Context, sessionID int64) error {
	resp, err := s.client.Send(ctx, Message{Janus: "destroy", SessionID: sessionID})
	if err != nil {
		return err
	}
	return requireSuccess(resp)
}

func (s *Service) AttachVideoroom(ctx context.Context, sessionID int64) (int64, error) {
	resp, err := s.client.Send(ctx, Message{
		Janus:     "attach",
		SessionID: sessionID,
		Plugin:    "janus.plugin.videoroom",
	})
	if err != nil {
		return 0, err
	}
	if err := requireSuccess(resp); err != nil {
		return 0, err
	}
	if resp.Data == nil || resp.Data.ID == 0 {
		return 0, errors.New("janus attach: missing handle id")
	}
	return resp.Data.ID, nil
}

func (s *Service) Detach(ctx context.Context, sessionID int64, handleID int64) error {
	resp, err := s.client.Send(ctx, Message{
		Janus:     "detach",
		SessionID: sessionID,
		HandleID:  handleID,
	})
	if err != nil {
		return err
	}
	return requireSuccess(resp)
}

type createRoomBody struct {
	Request    string `json:"request"`
	Room       string `json:"room"`
	Permanent  bool   `json:"permanent,omitempty"`
	Publishers int    `json:"publishers,omitempty"`
	Bitrate    int    `json:"bitrate,omitempty"`
	AudioCodec string `json:"audiocodec,omitempty"`
	VideoCodec string `json:"videocodec,omitempty"`
}

func (s *Service) EnsureRoom(ctx context.Context, sessionID int64, handleID int64, roomID string) error {
	events, cancel := s.client.Subscribe(256)
	defer cancel()

	body, _ := json.Marshal(createRoomBody{
		Request:    "create",
		Room:       roomID,
		Permanent:  false,
		Publishers: 50,
		Bitrate:    0,
		AudioCodec: "opus",
		VideoCodec: "vp8",
	})

	resp, err := s.client.Send(ctx, Message{
		Janus:     "message",
		SessionID: sessionID,
		HandleID:  handleID,
		Body:      body,
	})
	if err != nil {
		return err
	}
	if err := requireAckOrSuccess(resp); err != nil {
		return err
	}

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case msg, ok := <-events:
			if !ok {
				return ErrClosed
			}
			if msg.SessionID != sessionID {
				continue
			}
			if msg.Sender != 0 && msg.Sender != handleID {
				continue
			}
			if msg.PluginData == nil || len(msg.PluginData.Data) == 0 {
				continue
			}

			var base videoroomEvent
			if err := json.Unmarshal(msg.PluginData.Data, &base); err != nil {
				continue
			}

			if base.ErrorCode != 0 || base.Error != "" {
				// "Room exists" is fine for EnsureRoom.
				if base.ErrorCode == 427 {
					return nil
				}
				return &VideoroomError{Code: base.ErrorCode, Message: base.Error}
			}

			var created struct {
				Videoroom string `json:"videoroom"`
				Room      string `json:"room"`
			}
			if err := json.Unmarshal(msg.PluginData.Data, &created); err != nil {
				continue
			}
			if strings.ToLower(created.Videoroom) == "created" {
				return nil
			}
		}
	}
}

type joinPublisherBody struct {
	Request string `json:"request"`
	PType   string `json:"ptype"`
	Room    string `json:"room"`
	Display string `json:"display,omitempty"`
}

type videoroomEvent struct {
	Videoroom string `json:"videoroom"`
	ErrorCode int    `json:"error_code,omitempty"`
	Error     string `json:"error,omitempty"`
}

type joinedEvent struct {
	Videoroom string `json:"videoroom"`
	Room      string `json:"room"`
	ID        string `json:"id"`
	Publishers []struct {
		ID      string `json:"id"`
		Display string `json:"display,omitempty"`
	} `json:"publishers,omitempty"`
}

func (s *Service) JoinPublisher(ctx context.Context, sessionID int64, handleID int64, roomID string, display string) (string, []service.JanusPublisher, error) {
	events, cancel := s.client.Subscribe(256)
	defer cancel()

	body, _ := json.Marshal(joinPublisherBody{
		Request: "join",
		PType:   "publisher",
		Room:    roomID,
		Display: display,
	})

	resp, err := s.client.Send(ctx, Message{
		Janus:     "message",
		SessionID: sessionID,
		HandleID:  handleID,
		Body:      body,
	})
	if err != nil {
		return "", nil, err
	}
	if err := requireAckOrSuccess(resp); err != nil {
		return "", nil, err
	}

	ev, err := waitJoinedEvent(ctx, events, sessionID, handleID)
	if err != nil {
		return "", nil, err
	}

	pubs := make([]service.JanusPublisher, 0, len(ev.Publishers))
	for _, p := range ev.Publishers {
		pubs = append(pubs, service.JanusPublisher{FeedID: p.ID, Display: p.Display})
	}
	return ev.ID, pubs, nil
}

type publishBody struct {
	Request string `json:"request"`
	Audio   bool   `json:"audio"`
	Video   bool   `json:"video"`
	Data    bool   `json:"data"`
}

func (s *Service) Publish(ctx context.Context, sessionID int64, handleID int64, offer service.JanusJSEP) (service.JanusJSEP, error) {
	events, cancel := s.client.Subscribe(256)
	defer cancel()

	hasVideo := sdpHasSendingVideo(offer.SDP)
	body, _ := json.Marshal(publishBody{
		Request: "publish",
		Audio:   true,
		Video:   hasVideo,
		Data:    false,
	})
	jsep, _ := json.Marshal(offer)

	resp, err := s.client.Send(ctx, Message{
		Janus:     "message",
		SessionID: sessionID,
		HandleID:  handleID,
		Body:      body,
		JSEP:      jsep,
	})
	if err != nil {
		return service.JanusJSEP{}, err
	}
	if err := requireAckOrSuccess(resp); err != nil {
		return service.JanusJSEP{}, err
	}

	// For publish, Janus will emit a plugin event with jsep answer.
	type publishConfigured struct {
		Videoroom string `json:"videoroom"`
		Configured string `json:"configured,omitempty"`
	}

	msg, err := waitEventWithJSEP(ctx, events, sessionID, handleID, func(data json.RawMessage) bool {
		var ev videoroomEvent
		if err := json.Unmarshal(data, &ev); err == nil {
			if ev.ErrorCode != 0 || ev.Error != "" {
				return true
			}
		}
		var cfg publishConfigured
		if err := json.Unmarshal(data, &cfg); err != nil {
			return false
		}
		return strings.ToLower(cfg.Videoroom) == "event"
	})
	if err != nil {
		return service.JanusJSEP{}, err
	}
	if msg.PluginData != nil {
		var ev videoroomEvent
		_ = json.Unmarshal(msg.PluginData.Data, &ev)
		if ev.ErrorCode != 0 || ev.Error != "" {
			return service.JanusJSEP{}, &VideoroomError{Code: ev.ErrorCode, Message: ev.Error}
		}
	}

	var answer service.JanusJSEP
	if err := json.Unmarshal(msg.JSEP, &answer); err != nil {
		return service.JanusJSEP{}, errors.New("janus publish: missing jsep answer")
	}
	return answer, nil
}

func sdpHasSendingVideo(sdp string) bool {
	idx := strings.Index(sdp, "m=video")
	if idx < 0 {
		return false
	}
	rest := sdp[idx:]
	next := strings.Index(rest[1:], "\nm=")
	section := rest
	if next >= 0 {
		section = rest[:next+1]
	}
	section = strings.ToLower(section)
	// We only want to claim "video: true" if we're actually sending video.
	return strings.Contains(section, "a=sendrecv") || strings.Contains(section, "a=sendonly")
}

func (s *Service) AttachSubscriber(ctx context.Context, sessionID int64) (int64, error) {
	return s.AttachVideoroom(ctx, sessionID)
}

type joinSubscriberBody struct {
	Request string `json:"request"`
	PType   string `json:"ptype"`
	Room    string `json:"room"`
	Feed    string `json:"feed"`
}

func (s *Service) JoinSubscriber(ctx context.Context, sessionID int64, handleID int64, roomID string, feedID string) (service.JanusJSEP, error) {
	events, cancel := s.client.Subscribe(256)
	defer cancel()

	body, _ := json.Marshal(joinSubscriberBody{
		Request: "join",
		PType:   "subscriber",
		Room:    roomID,
		Feed:    feedID,
	})

	resp, err := s.client.Send(ctx, Message{
		Janus:     "message",
		SessionID: sessionID,
		HandleID:  handleID,
		Body:      body,
	})
	if err != nil {
		return service.JanusJSEP{}, err
	}
	if err := requireAckOrSuccess(resp); err != nil {
		return service.JanusJSEP{}, err
	}

	// For subscriber join, Janus will send a plugin event with jsep offer.
	msg, err := waitEventWithJSEP(ctx, events, sessionID, handleID, func(data json.RawMessage) bool {
		// With the legacy subscriber join API, Janus typically answers with:
		//   plugindata.data.videoroom = "attached" (and includes a JSEP offer).
		// Some versions may still use "event".
		var ev videoroomEvent
		if json.Unmarshal(data, &ev) != nil {
			return false
		}
		switch strings.ToLower(ev.Videoroom) {
		case "attached", "event":
			return true
		default:
			return false
		}
	})
	if err != nil {
		return service.JanusJSEP{}, err
	}

	var offer service.JanusJSEP
	if err := json.Unmarshal(msg.JSEP, &offer); err != nil {
		return service.JanusJSEP{}, errors.New("janus subscriber: missing jsep offer")
	}
	return offer, nil
}

type startBody struct {
	Request string `json:"request"`
}

func (s *Service) StartSubscriber(ctx context.Context, sessionID int64, handleID int64, answer service.JanusJSEP) error {
	body, _ := json.Marshal(startBody{Request: "start"})
	jsep, _ := json.Marshal(answer)

	resp, err := s.client.Send(ctx, Message{
		Janus:     "message",
		SessionID: sessionID,
		HandleID:  handleID,
		Body:      body,
		JSEP:      jsep,
	})
	if err != nil {
		return err
	}
	if err := requireAckOrSuccess(resp); err != nil {
		return err
	}
	return nil
}

func (s *Service) Trickle(ctx context.Context, sessionID int64, handleID int64, candidate json.RawMessage) error {
	resp, err := s.client.Send(ctx, Message{
		Janus:     "trickle",
		SessionID: sessionID,
		HandleID:  handleID,
		Candidate: candidate,
	})
	if err != nil {
		return err
	}
	return requireAckOrSuccess(resp)
}

// --- helpers ---

func requireSuccess(resp Message) error {
	switch strings.ToLower(resp.Janus) {
	case "success":
		return nil
	case "error":
		if resp.Error != nil {
			return fmt.Errorf("janus error: %d %s", resp.Error.Code, resp.Error.Reason)
		}
		return errors.New("janus error")
	default:
		return fmt.Errorf("unexpected janus response: %s", resp.Janus)
	}
}

func requireAckOrSuccess(resp Message) error {
	switch strings.ToLower(resp.Janus) {
	case "ack", "success":
		return nil
	case "error":
		if resp.Error != nil {
			return fmt.Errorf("janus error: %d %s", resp.Error.Code, resp.Error.Reason)
		}
		return errors.New("janus error")
	default:
		return fmt.Errorf("unexpected janus response: %s", resp.Janus)
	}
}

func waitJoinedEvent(ctx context.Context, events <-chan Message, sessionID int64, handleID int64) (joinedEvent, error) {
	for {
		select {
		case <-ctx.Done():
			return joinedEvent{}, ctx.Err()
		case msg, ok := <-events:
			if !ok {
				return joinedEvent{}, ErrClosed
			}
			if msg.SessionID != sessionID {
				continue
			}
			if msg.Sender != 0 && msg.Sender != handleID {
				continue
			}
			if msg.PluginData == nil || len(msg.PluginData.Data) == 0 {
				continue
			}

			// Catch plugin-level errors early.
			var base videoroomEvent
			if err := json.Unmarshal(msg.PluginData.Data, &base); err == nil {
				if base.ErrorCode != 0 || base.Error != "" {
					return joinedEvent{}, &VideoroomError{Code: base.ErrorCode, Message: base.Error}
				}
			}

			var j joinedEvent
			if err := json.Unmarshal(msg.PluginData.Data, &j); err != nil {
				continue
			}
			if strings.ToLower(j.Videoroom) != "joined" || j.ID == "" {
				continue
			}
			return j, nil
		}
	}
}

func waitEventWithJSEP(
	ctx context.Context,
	events <-chan Message,
	sessionID int64,
	handleID int64,
	accept func(data json.RawMessage) bool,
) (Message, error) {
	// There is no per-transaction correlation for async events, so we scan the shared event stream.
	// This is MVP and works as long as you don't do many concurrent operations per handle.
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	for {
		select {
		case <-ctx.Done():
			return Message{}, ctx.Err()
		case msg, ok := <-events:
			if !ok {
				return Message{}, ErrClosed
			}
			if msg.SessionID != sessionID {
				continue
			}
			if msg.Sender != 0 && msg.Sender != handleID {
				continue
			}
			if msg.PluginData == nil || len(msg.PluginData.Data) == 0 {
				continue
			}
			if len(msg.JSEP) == 0 {
				continue
			}
			if accept != nil && !accept(msg.PluginData.Data) {
				continue
			}
			return msg, nil
		}
	}
}
