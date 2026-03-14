# Events Contract

This document describes the user-scoped websocket event stream exposed by the backend.

## Endpoint

- `GET /api/ws/events`

The endpoint upgrades the HTTP connection to a websocket after standard API authentication.

`webrtc` signaling is not part of this stream and stays on its own websocket endpoint.

## Envelope

Every server event is sent as a JSON object with the following shape:

```json
{
  "type": "chat.message_created",
  "payload": {}
}
```

Fields:

- `type`: event name
- `payload`: event-specific JSON object

## Events

### `ready`

Sent once after a successful websocket connection.

Payload:

```json
{
  "user_id": "user-uuid"
}
```

### `voice.snapshot`

Sent on websocket connect for each space the user belongs to.
Contains the full voice presence snapshot for that space.

Payload:

```json
{
  "space_id": "space-uuid",
  "voice_members_by_channel_id": {
    "channel-uuid": [
      {
        "id": "user-uuid",
        "username": "alice",
        "is_admin": false,
        "muted": false,
        "deafened": false
      }
    ]
  }
}
```

Notes:

- only `voice` channels are included
- empty voice channels are represented as an empty array when present in the snapshot build result

### `voice.channel_members`

Sent when the member list of a voice channel changes.

Payload:

```json
{
  "space_id": "space-uuid",
  "channel_id": "channel-uuid",
  "members": [
    {
      "id": "user-uuid",
      "username": "alice",
      "is_admin": false,
      "muted": false,
      "deafened": false
    }
  ]
}
```

This event is emitted after:

- joining a voice channel
- leaving a voice channel
- updating mute/deafen state

### `chat.message_created`

Sent when a new channel chat message is created.

Payload:

```json
{
  "space_id": "space-uuid",
  "channel_id": "channel-uuid",
  "message": {
    "id": "message-uuid",
    "channel_id": "channel-uuid",
    "author_id": "user-uuid",
    "body": "hello",
    "created_at": "2026-03-12T12:00:00Z",
    "author": {
      "id": "user-uuid",
      "username": "alice",
      "is_admin": false
    }
  }
}
```

Notes:

- channel chat is available for both `text` and `voice` channels
- the event is broadcast to all members of the space that owns the channel

## Client Notes

- clients should route events by `type`
- clients should use `space_id` and `channel_id` from the payload to update the correct UI scope
- the websocket is user-scoped, so events may arrive for spaces other than the one currently open in the UI
