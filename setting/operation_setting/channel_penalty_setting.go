package operation_setting

import "github.com/QuantumNous/new-api/setting/config"

// defaultChannelPenaltyStatusCodes penalizes rate limits and all server errors.
const defaultChannelPenaltyStatusCodes = "429,500-599"

type ChannelPenaltySetting struct {
	Enabled           bool   `json:"enabled"`
	StatusCodes       string `json:"status_codes"`
	DurationSeconds   int    `json:"duration"`
	MaxPenalties      int    `json:"max_penalties"`
	RecoveryThreshold int    `json:"recovery_threshold"`
}

var channelPenaltySetting = ChannelPenaltySetting{
	Enabled:           false,
	StatusCodes:       defaultChannelPenaltyStatusCodes,
	DurationSeconds:   60,
	MaxPenalties:      3,
	RecoveryThreshold: 5,
}

func GetChannelPenaltySetting() *ChannelPenaltySetting {
	return &channelPenaltySetting
}

// ParsedStatusCodes parses the configured status code ranges, falling back to
// the default ranges when the configured value is empty or invalid.
func (s *ChannelPenaltySetting) ParsedStatusCodes() []StatusCodeRange {
	ranges, err := ParseHTTPStatusCodeRanges(s.StatusCodes)
	if err != nil || len(ranges) == 0 {
		ranges, _ = ParseHTTPStatusCodeRanges(defaultChannelPenaltyStatusCodes)
	}
	return ranges
}

func init() {
	config.GlobalConfig.Register("channel_penalty_setting", &channelPenaltySetting)
}
