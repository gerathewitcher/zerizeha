package dto

type VoicePresenceMember struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	IsAdmin  bool   `json:"is_admin"`
	Muted    bool   `json:"muted"`
	Deafened bool   `json:"deafened"`
}

type VoiceChannelMembersEvent struct {
	SpaceID   string                `json:"space_id"`
	ChannelID string                `json:"channel_id"`
	Revision  int64                 `json:"revision"`
	Members   []VoicePresenceMember `json:"members"`
}
