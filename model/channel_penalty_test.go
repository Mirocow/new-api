package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/assert"
)

func TestChannelPenaltyBasic(t *testing.T) {
	setting := operation_setting.GetChannelPenaltySetting()
	setting.Enabled = true
	defer func() { setting.Enabled = false }()
	// Clear any existing penalties
	ClearAllChannelPenalties()

	// Test penalizing a channel
	channelID := 99999
	reason := "test penalty"
	baseDuration := 10 * time.Second

	PenalizeChannel(channelID, baseDuration, reason)

	// Check if penalized
	assert.True(t, IsChannelPenalized(channelID))

	// Check remaining seconds
	remaining := GetPenaltyRemainingSeconds(channelID)
	assert.Greater(t, remaining, 0)
	assert.LessOrEqual(t, remaining, int(baseDuration.Seconds()))

	// Check reason
	assert.Equal(t, reason, GetPenaltyReason(channelID))

	// Check penalty count
	assert.Equal(t, 1, GetPenaltyCount(channelID))

	// Clear penalty
	ClearChannelPenalty(channelID)
	assert.False(t, IsChannelPenalized(channelID))
	assert.Equal(t, 0, GetPenaltyRemainingSeconds(channelID))
	assert.Equal(t, "", GetPenaltyReason(channelID))
	assert.Equal(t, 0, GetPenaltyCount(channelID))
}

func TestChannelPenaltyEscalation(t *testing.T) {
	ClearAllChannelPenalties()

	// Enable escalation in settings
	setting := operation_setting.GetChannelPenaltySetting()
	setting.Enabled = true
	originalMaxPenalties := setting.MaxPenalties
	defer func() {
		// Restore settings
		setting.MaxPenalties = originalMaxPenalties
		setting.Enabled = false
	}()

	setting.MaxPenalties = 2

	channelID := 99998
	reason := "escalation test"
	baseDuration := 10 * time.Second

	// First penalty: below the escalation threshold, base duration
	PenalizeChannel(channelID, baseDuration, reason)
	assert.Equal(t, 1, GetPenaltyCount(channelID))
	remaining1 := GetPenaltyRemainingSeconds(channelID)
	assert.Greater(t, remaining1, 0)
	assert.LessOrEqual(t, remaining1, int(baseDuration.Seconds()))

	// Second penalty reaches MaxPenalties: base * count
	PenalizeChannel(channelID, baseDuration, reason)
	assert.Equal(t, 2, GetPenaltyCount(channelID))
	remaining2 := GetPenaltyRemainingSeconds(channelID)
	assert.Greater(t, remaining2, int(baseDuration.Seconds()))

	// Third penalty escalates further
	PenalizeChannel(channelID, baseDuration, reason)
	assert.Equal(t, 3, GetPenaltyCount(channelID))
	remaining3 := GetPenaltyRemainingSeconds(channelID)
	assert.Greater(t, remaining3, remaining2)

	// Test that clearing resets the count
	ClearChannelPenalty(channelID)
	PenalizeChannel(channelID, baseDuration, reason)
	assert.Equal(t, 1, GetPenaltyCount(channelID))
}

func TestChannelPenaltyResetOnSuccess(t *testing.T) {
	setting := operation_setting.GetChannelPenaltySetting()
	setting.Enabled = true
	originalThreshold := setting.RecoveryThreshold
	defer func() {
		setting.RecoveryThreshold = originalThreshold
		setting.Enabled = false
	}()
	setting.RecoveryThreshold = 2
	ClearAllChannelPenalties()

	channelID := 99997
	reason := "reset test"
	baseDuration := 10 * time.Second

	PenalizeChannel(channelID, baseDuration, reason)
	assert.Equal(t, 1, GetPenaltyCount(channelID))

	// One success is below the recovery threshold: counter stays
	ResetPenaltyCountOnSuccess(channelID)
	assert.Equal(t, 1, GetPenaltyCount(channelID))

	// Reaching the threshold clears the counter, but the active
	// penalty itself still exists until expiry
	ResetPenaltyCountOnSuccess(channelID)
	assert.Equal(t, 0, GetPenaltyCount(channelID))
	assert.Equal(t, "", GetPenaltyReason(channelID))
	assert.True(t, IsChannelPenalized(channelID))
}

func TestChannelPenaltyDisabled(t *testing.T) {
	ClearAllChannelPenalties()

	// Disable penalty in settings
	setting := operation_setting.GetChannelPenaltySetting()
	setting.Enabled = true
	originalEnabled := setting.Enabled
	defer func() {
		setting.Enabled = originalEnabled
	}()

	setting.Enabled = false

	channelID := 99996
	PenalizeChannel(channelID, 10*time.Second, "test")
	assert.False(t, IsChannelPenalized(channelID))
	assert.Equal(t, 0, GetPenaltyCount(channelID))
}

func TestGetAllPenalizedChannels(t *testing.T) {
	ClearAllChannelPenalties()

	channelID1 := 99995
	channelID2 := 99994

	PenalizeChannel(channelID1, 10*time.Second, "penalty 1")
	PenalizeChannel(channelID2, 20*time.Second, "penalty 2")

	penalties := GetAllPenalizedChannels()
	assert.GreaterOrEqual(t, len(penalties), 2)

	found1 := false
	found2 := false
	for _, p := range penalties {
		if p.ChannelID == channelID1 {
			found1 = true
			assert.Equal(t, "penalty 1", p.Reason)
			assert.Equal(t, 1, p.PenaltyCount)
		}
		if p.ChannelID == channelID2 {
			found2 = true
			assert.Equal(t, "penalty 2", p.Reason)
			assert.Equal(t, 1, p.PenaltyCount)
		}
	}
	assert.True(t, found1)
	assert.True(t, found2)

	// Cleanup
	ClearChannelPenalty(channelID1)
	ClearChannelPenalty(channelID2)
}

func TestChannelPenaltyExpired(t *testing.T) {
	setting := operation_setting.GetChannelPenaltySetting()
	setting.Enabled = true
	defer func() { setting.Enabled = false }()
	ClearAllChannelPenalties()

	channelID := 99993
	reason := "expired test"

	// Penalize with very short duration
	PenalizeChannel(channelID, 100*time.Millisecond, reason)
	assert.True(t, IsChannelPenalized(channelID))

	// Wait for expiry
	time.Sleep(200 * time.Millisecond)

	// Should no longer be penalized
	assert.False(t, IsChannelPenalized(channelID))
	assert.Equal(t, 0, GetPenaltyRemainingSeconds(channelID))
}

func TestCleanupExpired(t *testing.T) {
	setting := operation_setting.GetChannelPenaltySetting()
	setting.Enabled = true
	defer func() { setting.Enabled = false }()

	ClearAllChannelPenalties()

	channelID1 := 99992
	channelID2 := 99991

	// Penalize one with short duration, one with long
	PenalizeChannel(channelID1, 100*time.Millisecond, "short")
	PenalizeChannel(channelID2, 10*time.Second, "long")

	// Wait for first to expire
	time.Sleep(200 * time.Millisecond)

	// Run cleanup
	CleanupExpired()

	// First should be cleaned up
	assert.False(t, IsChannelPenalized(channelID1))
	// Second should still exist
	assert.True(t, IsChannelPenalized(channelID2))

	ClearChannelPenalty(channelID2)
}
