package service

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/assert"
)

func TestShouldPenalizeChannel(t *testing.T) {
	// Save original settings
	originalEnabled := operation_setting.GetChannelPenaltySetting().Enabled
	originalStatusCodes := operation_setting.GetChannelPenaltySetting().StatusCodes
	defer func() {
		setting := operation_setting.GetChannelPenaltySetting()
		setting.Enabled = originalEnabled
		setting.StatusCodes = originalStatusCodes
	}()

	setting := operation_setting.GetChannelPenaltySetting()
	setting.Enabled = true
	setting.StatusCodes = "429,500-599"

	tests := []struct {
		name           string
		err            *types.NewAPIError
		shouldPenalize bool
	}{
		{
			name:           "nil error",
			err:            nil,
			shouldPenalize: false,
		},
		{
			name:           "disabled setting",
			err:            types.NewError(nil, types.ErrorCodeBadResponseStatusCode, types.ErrOptionWithStatusCode(500)),
			shouldPenalize: false,
		},
		{
			name:           "matching status code 429",
			err:            types.NewError(nil, types.ErrorCodeBadResponseStatusCode, types.ErrOptionWithStatusCode(429)),
			shouldPenalize: true,
		},
		{
			name:           "matching status code 500",
			err:            types.NewError(nil, types.ErrorCodeBadResponseStatusCode, types.ErrOptionWithStatusCode(500)),
			shouldPenalize: true,
		},
		{
			name:           "matching status code 502",
			err:            types.NewError(nil, types.ErrorCodeBadResponseStatusCode, types.ErrOptionWithStatusCode(502)),
			shouldPenalize: true,
		},
		{
			name:           "matching status code 503",
			err:            types.NewError(nil, types.ErrorCodeBadResponseStatusCode, types.ErrOptionWithStatusCode(503)),
			shouldPenalize: true,
		},
		{
			name:           "non-matching status code 400",
			err:            types.NewError(nil, types.ErrorCodeBadResponseStatusCode, types.ErrOptionWithStatusCode(400)),
			shouldPenalize: false,
		},
		{
			name:           "non-matching status code 401",
			err:            types.NewError(nil, types.ErrorCodeBadResponseStatusCode, types.ErrOptionWithStatusCode(401)),
			shouldPenalize: false,
		},
		{
			name:           "non-matching status code 404",
			err:            types.NewError(nil, types.ErrorCodeBadResponseStatusCode, types.ErrOptionWithStatusCode(404)),
			shouldPenalize: false,
		},
		{
			name:           "non-matching status code 504",
			err:            types.NewError(nil, types.ErrorCodeBadResponseStatusCode, types.ErrOptionWithStatusCode(504)),
			shouldPenalize: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.name == "disabled setting" {
				setting.Enabled = false
			} else {
				setting.Enabled = true
			}

			result := ShouldPenalizeChannel(tt.err)
			assert.Equal(t, tt.shouldPenalize, result)
		})
	}
}

func TestShouldPenalizeChannel_ChannelError(t *testing.T) {
	// Channel errors should not trigger penalty
	err := types.NewError(nil, types.ErrorCodeChannelInvalidKey, types.ErrOptionWithStatusCode(500))

	result := ShouldPenalizeChannel(err)
	assert.False(t, result, "Channel errors should not be penalized")
}

func TestShouldPenalizeChannel_SkipRetryError(t *testing.T) {
	// Skip retry errors should not trigger penalty
	err := types.NewError(nil, types.ErrorCodeBadResponseStatusCode,
		types.ErrOptionWithStatusCode(500),
		types.ErrOptionWithSkipRetry())

	result := ShouldPenalizeChannel(err)
	assert.False(t, result, "Skip retry errors should not be penalized")
}

func TestGetPenaltyDuration(t *testing.T) {
	originalDuration := operation_setting.GetChannelPenaltySetting().DurationSeconds
	defer func() {
		setting := operation_setting.GetChannelPenaltySetting()
		setting.DurationSeconds = originalDuration
	}()

	setting := operation_setting.GetChannelPenaltySetting()
	setting.DurationSeconds = 120

	duration := GetPenaltyDuration()
	assert.Equal(t, 120*time.Second, duration)
}

func TestPenalizeChannelIntegration(t *testing.T) {
	setting := operation_setting.GetChannelPenaltySetting()
	setting.Enabled = true
	setting.RecoveryThreshold = 1
	defer func() {
		setting.Enabled = false
		setting.RecoveryThreshold = 5
	}()

	ClearAllChannelPenalties()

	channelID := 88888
	reason := "integration test"
	duration := GetPenaltyDuration()

	// Penalize
	PenalizeChannel(channelID, duration, reason)

	// Verify
	assert.True(t, IsChannelPenalized(channelID))
	assert.Equal(t, reason, GetPenaltyReason(channelID))
	assert.Equal(t, 1, GetPenaltyCount(channelID))

	remaining := GetPenaltyRemainingSeconds(channelID)
	assert.Greater(t, remaining, 0)
	assert.LessOrEqual(t, remaining, int(duration.Seconds()))

	// Reset on success
	ResetPenaltyCountOnSuccess(channelID)
	assert.Equal(t, 0, GetPenaltyCount(channelID))
	assert.Equal(t, "", GetPenaltyReason(channelID))

	// Clear
	ClearChannelPenalty(channelID)
	assert.False(t, IsChannelPenalized(channelID))

	// Cleanup
	ClearAllChannelPenalties()
}