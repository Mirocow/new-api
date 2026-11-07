package model

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

const (
	penaltyCacheKeyPrefix = "new-api:channel_penalty:v1:"
)

var (
	penaltyLock      sync.RWMutex
	penaltyChannels  = make(map[int]int64)  // channelID -> penalty until (unix nano)
	penaltyCount     = make(map[int]int)    // channelID -> consecutive penalty count (for escalation)
	penaltyReason    = make(map[int]string) // channelID -> reason for penalty
	penaltySuccesses = make(map[int]int)    // channelID -> consecutive successful requests since the last penalty
)

// PenaltyInfo represents a penalized channel with its remaining time.
type PenaltyInfo struct {
	ChannelID        int    `json:"channel_id"`
	ChannelName      string `json:"channel_name,omitempty"`
	RemainingSeconds int    `json:"remaining_seconds"`
	Reason           string `json:"reason"`
	PenaltyCount     int    `json:"penalty_count"`
}

// PenalizeChannel puts a channel into the penalty box.
// Duration can escalate for repeat offenders.
func PenalizeChannel(channelID int, baseDuration time.Duration, reason string) {
	setting := operation_setting.GetChannelPenaltySetting()
	if !setting.Enabled {
		return
	}

	// Always increment penalty count for tracking
	penaltyLock.Lock()
	penaltyCount[channelID]++
	count := penaltyCount[channelID]
	penaltyLock.Unlock()

	duration := baseDuration
	if setting.MaxPenalties > 0 && count >= setting.MaxPenalties {
		// Escalate: once the channel reaches MaxPenalties strikes, it is
		// excluded for the base duration multiplied by its penalty count.
		duration = baseDuration * time.Duration(count)
	}

	until := time.Now().Add(duration).UnixNano()
	penaltyLock.Lock()
	penaltyChannels[channelID] = until
	penaltyReason[channelID] = reason
	delete(penaltySuccesses, channelID)
	penaltyLock.Unlock()

	// Redis backing for multi-instance (optional, best-effort)
	if common.RedisEnabled {
		ctx := context.Background()
		key := penaltyCacheKeyPrefix + fmt.Sprintf("%d", channelID)
		data := map[string]any{
			"until":        until,
			"count":        count,
			"reason":       reason,
			"duration_sec": int(duration.Seconds()),
		}
		jsonData, err := common.Marshal(data)
		if err == nil {
			common.RDB.Set(ctx, key, jsonData, duration)
		}
	}
}

// IsChannelPenalized checks local map + Redis.
func IsChannelPenalized(channelID int) bool {
	penaltyLock.RLock()
	until, exists := penaltyChannels[channelID]
	penaltyLock.RUnlock()

	if exists && time.Now().UnixNano() < until {
		return true
	}

	// Check Redis if enabled
	if common.RedisEnabled {
		ctx := context.Background()
		key := penaltyCacheKeyPrefix + fmt.Sprintf("%d", channelID)
		_, err := common.RDB.Get(ctx, key).Result()
		return err == nil
	}
	return false
}

// GetPenaltyRemainingSeconds returns remaining penalty seconds for a channel.
func GetPenaltyRemainingSeconds(channelID int) int {
	penaltyLock.RLock()
	until, exists := penaltyChannels[channelID]
	penaltyLock.RUnlock()

	if !exists {
		return 0
	}
	remaining := until - time.Now().UnixNano()
	if remaining <= 0 {
		return 0
	}
	return int(remaining / 1e9)
}

// GetPenaltyReason returns the penalty reason for a channel.
func GetPenaltyReason(channelID int) string {
	penaltyLock.RLock()
	reason := penaltyReason[channelID]
	penaltyLock.RUnlock()
	return reason
}

// GetPenaltyCount returns the escalation count for a channel.
func GetPenaltyCount(channelID int) int {
	penaltyLock.RLock()
	count := penaltyCount[channelID]
	penaltyLock.RUnlock()
	return count
}

// ResetPenaltyCountOnSuccess tracks consecutive successful requests and
// clears the escalation counter once RecoveryThreshold successes accumulate.
func ResetPenaltyCountOnSuccess(channelID int) {
	setting := operation_setting.GetChannelPenaltySetting()
	threshold := max(setting.RecoveryThreshold, 1)

	recovered := false
	penaltyLock.Lock()
	penaltySuccesses[channelID]++
	if penaltySuccesses[channelID] >= threshold {
		recovered = true
		delete(penaltyCount, channelID)
		delete(penaltyReason, channelID)
		delete(penaltySuccesses, channelID)
	}
	penaltyLock.Unlock()

	// Also clear from Redis
	if recovered && common.RedisEnabled {
		ctx := context.Background()
		key := penaltyCacheKeyPrefix + fmt.Sprintf("%d", channelID)
		common.RDB.Del(ctx, key)
	}
}

// ClearChannelPenalty removes penalty for a specific channel.
func ClearChannelPenalty(channelID int) {
	penaltyLock.Lock()
	delete(penaltyChannels, channelID)
	delete(penaltyCount, channelID)
	delete(penaltyReason, channelID)
	delete(penaltySuccesses, channelID)
	penaltyLock.Unlock()

	if common.RedisEnabled {
		ctx := context.Background()
		key := penaltyCacheKeyPrefix + fmt.Sprintf("%d", channelID)
		common.RDB.Del(ctx, key)
	}
}

// ClearAllChannelPenalties removes all penalties.
func ClearAllChannelPenalties() {
	penaltyLock.Lock()
	penaltyChannels = make(map[int]int64)
	penaltyCount = make(map[int]int)
	penaltyReason = make(map[int]string)
	penaltySuccesses = make(map[int]int)
	penaltyLock.Unlock()

	if common.RedisEnabled {
		ctx := context.Background()
		iter := common.RDB.Scan(ctx, 0, penaltyCacheKeyPrefix+"*", 100).Iterator()
		for iter.Next(ctx) {
			common.RDB.Del(ctx, iter.Val())
		}
	}
}

// GetAllPenalizedChannels returns all currently penalized channels with their info.
func GetAllPenalizedChannels() []PenaltyInfo {
	var result []PenaltyInfo

	penaltyLock.RLock()
	// Copy to avoid holding lock during channel name lookup
	type localInfo struct {
		id     int
		until  int64
		reason string
		count  int
	}
	var local []localInfo
	for id, until := range penaltyChannels {
		local = append(local, localInfo{
			id:     id,
			until:  until,
			reason: penaltyReason[id],
			count:  penaltyCount[id],
		})
	}
	penaltyLock.RUnlock()

	for _, info := range local {
		remaining := info.until - time.Now().UnixNano()
		if remaining <= 0 {
			continue
		}
		name := ""
		if ch, err := CacheGetChannel(info.id); err == nil && ch != nil {
			name = ch.Name
		}
		result = append(result, PenaltyInfo{
			ChannelID:        info.id,
			ChannelName:      name,
			RemainingSeconds: int(remaining / 1e9),
			Reason:           info.reason,
			PenaltyCount:     info.count,
		})
	}

	// Also check Redis for entries not in local map (multi-instance)
	if common.RedisEnabled {
		ctx := context.Background()
		iter := common.RDB.Scan(ctx, 0, penaltyCacheKeyPrefix+"*", 100).Iterator()
		for iter.Next(ctx) {
			key := iter.Val()
			data, err := common.RDB.Get(ctx, key).Result()
			if err != nil {
				continue
			}
			var redisData struct {
				Until       int64  `json:"until"`
				Count       int    `json:"count"`
				Reason      string `json:"reason"`
				DurationSec int    `json:"duration_sec"`
			}
			if err := common.Unmarshal([]byte(data), &redisData); err != nil {
				continue
			}
			remaining := redisData.Until - time.Now().UnixNano()
			if remaining <= 0 {
				continue
			}
			// Extract channel ID from key
			var channelID int
			fmt.Sscanf(key, penaltyCacheKeyPrefix+"%d", &channelID)

			// Check if already in result
			found := false
			for _, r := range result {
				if r.ChannelID == channelID {
					found = true
					break
				}
			}
			if !found {
				name := ""
				if ch, err := CacheGetChannel(channelID); err == nil && ch != nil {
					name = ch.Name
				}
				result = append(result, PenaltyInfo{
					ChannelID:        channelID,
					ChannelName:      name,
					RemainingSeconds: int(remaining / 1e9),
					Reason:           redisData.Reason,
					PenaltyCount:     redisData.Count,
				})
			}
		}
	}

	return result
}

// CleanupExpired removes expired entries from local maps.
// Called periodically by a background goroutine.
func CleanupExpired() {
	penaltyLock.Lock()
	now := time.Now().UnixNano()
	for id, until := range penaltyChannels {
		if until <= now {
			delete(penaltyChannels, id)
			delete(penaltyCount, id)
			delete(penaltyReason, id)
			delete(penaltySuccesses, id)
		}
	}
	penaltyLock.Unlock()
}
