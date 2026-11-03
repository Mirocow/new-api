package service

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newTestTracker returns a tracker with short thresholds so transitions are
// exercised without sleeping for the production defaults.
func newTestTracker() *ChannelHealthTracker {
	t := &ChannelHealthTracker{
		failureThreshold: 3,
		successThreshold: 2,
		cooldown:         50 * time.Millisecond,
		window:           time.Second,
		states:           make(map[int]*channelCircuitState),
	}
	return t
}

func TestCircuitBreakerStaysClosedBelowThreshold(t *testing.T) {
	tr := newTestTracker()
	const ch = 100

	for range tr.failureThreshold - 1 {
		opened := tr.RecordFailure(ch)
		require.False(t, opened)
	}
	assert.Equal(t, CircuitClosed, tr.GetStatus(ch))
	assert.True(t, tr.IsAvailable(ch), "channel should remain available below threshold")
}

func TestCircuitBreakerOpensAtThreshold(t *testing.T) {
	tr := newTestTracker()
	const ch = 101

	for range tr.failureThreshold {
		tr.RecordFailure(ch)
	}
	assert.Equal(t, CircuitOpen, tr.GetStatus(ch))
	assert.False(t, tr.IsAvailable(ch), "open breaker must block requests")
}

func TestCircuitBreakerHalfOpenAfterCooldown(t *testing.T) {
	tr := newTestTracker()
	tr.cooldown = 10 * time.Millisecond
	const ch = 102

	for range tr.failureThreshold {
		tr.RecordFailure(ch)
	}
	require.Equal(t, CircuitOpen, tr.GetStatus(ch))

	time.Sleep(15 * time.Millisecond)

	// First IsAvailable after cooldown transitions to half-open and lets one
	// test request through.
	assert.True(t, tr.IsAvailable(ch), "half-open should allow one test request")
	assert.Equal(t, CircuitHalfOpen, tr.GetStatus(ch))

	// A second concurrent check must not let another request through until the
	// test request resolves.
	assert.False(t, tr.IsAvailable(ch), "only one half-open test request allowed")
}

func TestCircuitBreakerClosesFromHalfOpenAfterSuccessThreshold(t *testing.T) {
	tr := newTestTracker()
	tr.cooldown = 10 * time.Millisecond
	const ch = 103

	for range tr.failureThreshold {
		tr.RecordFailure(ch)
	}
	require.Equal(t, CircuitOpen, tr.GetStatus(ch))

	time.Sleep(15 * time.Millisecond)
	require.True(t, tr.IsAvailable(ch)) // transition to half-open

	for range tr.successThreshold {
		tr.RecordSuccess(ch)
	}
	assert.Equal(t, CircuitClosed, tr.GetStatus(ch), "enough half-open successes should close the breaker")
	assert.True(t, tr.IsAvailable(ch))
}

func TestCircuitBreakerReopensFromHalfOpenOnFailure(t *testing.T) {
	tr := newTestTracker()
	tr.cooldown = 10 * time.Millisecond
	const ch = 104

	for range tr.failureThreshold {
		tr.RecordFailure(ch)
	}
	require.Equal(t, CircuitOpen, tr.GetStatus(ch))

	time.Sleep(15 * time.Millisecond)
	require.True(t, tr.IsAvailable(ch)) // half-open test request

	opened := tr.RecordFailure(ch)
	require.True(t, opened, "failure during half-open should reopen the breaker")
	assert.Equal(t, CircuitOpen, tr.GetStatus(ch))
	assert.False(t, tr.IsAvailable(ch))
}

func TestCircuitBreakerSuccessInClosedClearsFailures(t *testing.T) {
	tr := newTestTracker()
	const ch = 105

	// Accumulate some failures but stay below threshold.
	for range tr.failureThreshold - 1 {
		tr.RecordFailure(ch)
	}
	_, failuresBefore, _, _ := tr.GetStats(ch)
	require.Equal(t, tr.failureThreshold-1, failuresBefore)

	tr.RecordSuccess(ch)

	_, failuresAfter, _, _ := tr.GetStats(ch)
	assert.Equal(t, 0, failuresAfter, "success in closed state should clear the failure window")
	assert.Equal(t, CircuitClosed, tr.GetStatus(ch))
}

func TestCircuitBreakerResetClearsState(t *testing.T) {
	tr := newTestTracker()
	const ch = 106

	for range tr.failureThreshold {
		tr.RecordFailure(ch)
	}
	require.Equal(t, CircuitOpen, tr.GetStatus(ch))

	tr.Reset(ch)
	assert.Equal(t, CircuitClosed, tr.GetStatus(ch), "Reset should return the channel to closed")
	assert.True(t, tr.IsAvailable(ch))
}

func TestCircuitBreakerUnknownChannelIsAvailable(t *testing.T) {
	tr := newTestTracker()
	assert.True(t, tr.IsAvailable(9999), "unknown channel should be considered available")
	assert.Equal(t, CircuitClosed, tr.GetStatus(9999))
}
