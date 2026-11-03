package service

import (
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
)

type ChannelHealthTracker struct {
	mu               sync.RWMutex
	failureThreshold int
	successThreshold int
	cooldown         time.Duration
	window           time.Duration
	states           map[int]*channelCircuitState
}

type channelCircuitState struct {
	mu           sync.Mutex
	status       CircuitStatus
	failures     []time.Time
	successes    int
	lastFailure  time.Time
	lastSuccess  time.Time
	openedAt     time.Time
	halfOpenTest bool
}

type CircuitStatus int

const (
	CircuitClosed CircuitStatus = iota
	CircuitOpen
	CircuitHalfOpen
)

func (s CircuitStatus) String() string {
	switch s {
	case CircuitClosed:
		return "closed"
	case CircuitOpen:
		return "open"
	case CircuitHalfOpen:
		return "half-open"
	default:
		return "unknown"
	}
}

const (
	DefaultFailureThreshold = 5
	DefaultSuccessThreshold = 2
	DefaultCooldown         = 30 * time.Second
	DefaultWindow           = 60 * time.Second
)

func NewChannelHealthTracker() *ChannelHealthTracker {
	return &ChannelHealthTracker{
		failureThreshold: DefaultFailureThreshold,
		successThreshold: DefaultSuccessThreshold,
		cooldown:         DefaultCooldown,
		window:           DefaultWindow,
		states:           make(map[int]*channelCircuitState),
	}
}

func (t *ChannelHealthTracker) RecordFailure(channelID int) bool {
	t.mu.Lock()
	state, ok := t.states[channelID]
	if !ok {
		state = &channelCircuitState{status: CircuitClosed}
		t.states[channelID] = state
	}
	t.mu.Unlock()

	state.mu.Lock()
	defer state.mu.Unlock()

	now := time.Now()
	state.lastFailure = now

	cutoff := now.Add(-t.window)
	validFailures := state.failures[:0]
	for _, ts := range state.failures {
		if ts.After(cutoff) {
			validFailures = append(validFailures, ts)
		}
	}
	state.failures = append(validFailures, now)

	if state.status == CircuitClosed && len(state.failures) >= t.failureThreshold {
		state.status = CircuitOpen
		state.openedAt = now
		logger.LogWarn(nil, common.LogText("circuit breaker OPENED for channel %d (failures: %d)", channelID, len(state.failures)))
		return true
	}

	if state.status == CircuitHalfOpen {
		state.status = CircuitOpen
		state.openedAt = now
		state.halfOpenTest = false
		state.successes = 0
		logger.LogWarn(nil, common.LogText("circuit breaker REOPENED for channel %d (half-open test failed)", channelID))
		return true
	}

	return false
}

func (t *ChannelHealthTracker) RecordSuccess(channelID int) bool {
	t.mu.RLock()
	state, ok := t.states[channelID]
	t.mu.RUnlock()

	if !ok {
		return false
	}

	state.mu.Lock()
	defer state.mu.Unlock()

	now := time.Now()
	state.lastSuccess = now

	switch state.status {
	case CircuitClosed:
		state.failures = state.failures[:0]
		return false
	case CircuitHalfOpen:
		state.successes++
		if state.successes >= t.successThreshold {
			state.status = CircuitClosed
			state.failures = state.failures[:0]
			state.successes = 0
			state.halfOpenTest = false
			logger.LogInfo(nil, common.LogText("circuit breaker CLOSED for channel %d", channelID))
			return true
		}
		return false
	case CircuitOpen:
		return false
	}
	return false
}

func (t *ChannelHealthTracker) IsAvailable(channelID int) bool {
	t.mu.RLock()
	state, ok := t.states[channelID]
	t.mu.RUnlock()

	if !ok {
		return true
	}

	state.mu.Lock()
	defer state.mu.Unlock()

	now := time.Now()

	switch state.status {
	case CircuitClosed:
		return true
	case CircuitOpen:
		if now.Sub(state.openedAt) >= t.cooldown {
			if !state.halfOpenTest {
				state.status = CircuitHalfOpen
				state.halfOpenTest = true
				state.successes = 0
				logger.LogInfo(nil, common.LogText("circuit breaker HALF-OPEN for channel %d (test request allowed)", channelID))
				return true
			}
			return false
		}
		return false
	case CircuitHalfOpen:
		// Only the single test request admitted during the Open→HalfOpen
		// transition may proceed; concurrent callers must wait until that
		// test resolves via RecordSuccess/RecordFailure.
		return false
	default:
		return true
	}
}

func (t *ChannelHealthTracker) GetStatus(channelID int) CircuitStatus {
	t.mu.RLock()
	state, ok := t.states[channelID]
	t.mu.RUnlock()

	if !ok {
		return CircuitClosed
	}

	state.mu.Lock()
	defer state.mu.Unlock()
	return state.status
}

func (t *ChannelHealthTracker) Reset(channelID int) {
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.states, channelID)
}

func (t *ChannelHealthTracker) GetStats(channelID int) (status CircuitStatus, failures int, lastFailure time.Time, lastSuccess time.Time) {
	t.mu.RLock()
	state, ok := t.states[channelID]
	t.mu.RUnlock()

	if !ok {
		return CircuitClosed, 0, time.Time{}, time.Time{}
	}

	state.mu.Lock()
	defer state.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-t.window)
	validFailures := 0
	for _, ts := range state.failures {
		if ts.After(cutoff) {
			validFailures++
		}
	}

	return state.status, validFailures, state.lastFailure, state.lastSuccess
}

var channelHealthTracker = NewChannelHealthTracker()

func ChannelHealth() *ChannelHealthTracker {
	return channelHealthTracker
}

func IsChannelHealthy(channelID int) bool {
	return channelHealthTracker.IsAvailable(channelID)
}

func OnChannelFailure(channelID int) bool {
	return channelHealthTracker.RecordFailure(channelID)
}

func OnChannelSuccess(channelID int) bool {
	return channelHealthTracker.RecordSuccess(channelID)
}

func ShouldSkipChannelForCircuitBreaker(channelID int) bool {
	return !channelHealthTracker.IsAvailable(channelID)
}
