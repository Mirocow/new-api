package operation_setting

import "github.com/QuantumNous/new-api/setting/config"

type ChannelPenaltySetting struct {
	Enabled           bool              `json:"enabled"`
	DurationSeconds   int               `json:"duration_seconds"`
	StatusCodes       []StatusCodeRange `json:"status_codes"`
	EscalationEnabled bool              `json:"escalation_enabled"`
	MaxPenaltySeconds int               `json:"max_penalty_seconds"`
}

var channelPenaltySetting = ChannelPenaltySetting{
	Enabled:           false,
	DurationSeconds:   60,
	StatusCodes: []StatusCodeRange{
		{Start: 429, End: 429},
		{Start: 500, End: 503},
	},
	EscalationEnabled: false,
	MaxPenaltySeconds: 600,
}

func GetChannelPenaltySetting() *ChannelPenaltySetting {
	return &channelPenaltySetting
}

func ChannelPenaltySettingToString() string {
	// For config persistence, we could serialize to JSON but the config system handles struct fields
	return ""
}

func ChannelPenaltySettingFromString(s string) {
	// Not used - config system handles JSON unmarshaling
}

func init() {
	config.GlobalConfig.Register("channel_penalty_setting", &channelPenaltySetting)
}