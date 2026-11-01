package service

import (
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

// Re-export PenaltyInfo from model
type PenaltyInfo = model.PenaltyInfo

// Re-export penalty functions from model
var (
	PenalizeChannel           = model.PenalizeChannel
	IsChannelPenalized        = model.IsChannelPenalized
	GetPenaltyRemainingSeconds = model.GetPenaltyRemainingSeconds
	GetPenaltyReason          = model.GetPenaltyReason
	GetPenaltyCount           = model.GetPenaltyCount
	ResetPenaltyCountOnSuccess = model.ResetPenaltyCountOnSuccess
	ClearChannelPenalty       = model.ClearChannelPenalty
	ClearAllChannelPenalties  = model.ClearAllChannelPenalties
	GetAllPenalizedChannels   = model.GetAllPenalizedChannels
	CleanupExpired            = model.CleanupExpired
)

// ShouldPenalizeChannel determines if a channel should be penalized based on the error.
func ShouldPenalizeChannel(err *types.NewAPIError) bool {
	if err == nil {
		return false
	}
	setting := operation_setting.GetChannelPenaltySetting()
	if !setting.Enabled {
		return false
	}
	// Channel errors (invalid key etc.) are already handled by ShouldDisableChannel
	if types.IsChannelError(err) {
		return false
	}
	if types.IsSkipRetryError(err) {
		return false
	}
	return operation_setting.ShouldMatchStatusCodeRanges(setting.StatusCodes, err.StatusCode)
}

// GetPenaltyDuration returns the base penalty duration from settings.
func GetPenaltyDuration() time.Duration {
	setting := operation_setting.GetChannelPenaltySetting()
	return time.Duration(setting.DurationSeconds) * time.Second
}