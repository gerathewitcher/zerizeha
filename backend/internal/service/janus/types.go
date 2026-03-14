package janus

import (
	"encoding/json"

	"github.com/google/uuid"
)

type Message struct {
	Janus       string          `json:"janus,omitempty"`
	Transaction string          `json:"transaction,omitempty"`
	SessionID   int64           `json:"session_id,omitempty"`
	HandleID    int64           `json:"handle_id,omitempty"`
	Plugin      string          `json:"plugin,omitempty"`
	Body        json.RawMessage `json:"body,omitempty"`
	JSEP        json.RawMessage `json:"jsep,omitempty"`
	Candidate   json.RawMessage `json:"candidate,omitempty"`

	Data *struct {
		ID int64 `json:"id"`
	} `json:"data,omitempty"`
	Error *struct {
		Code   int    `json:"code"`
		Reason string `json:"reason"`
	} `json:"error,omitempty"`

	// Janus "event" messages have: sender (handle_id) + plugindata.data
	Sender     int64 `json:"sender,omitempty"`
	PluginData *struct {
		Plugin string          `json:"plugin"`
		Data   json.RawMessage `json:"data"`
	} `json:"plugindata,omitempty"`
}

func newTx() string {
	return uuid.NewString()
}
