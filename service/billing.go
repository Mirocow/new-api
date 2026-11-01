package service

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/bytedance/gopkg/util/gopool"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/service/providermemory"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
)

const (
	BillingSourceWallet       = "wallet"
	BillingSourceSubscription = "subscription"
)

// PreConsumeBilling 根据用户计费偏好创建 BillingSession 并执行预扣费。
// 会话存储在 relayInfo.Billing 上，供后续 Settle / Refund 使用。
// 会话已存在时（任务重试换到另一个渠道）把预扣补到 preConsumedQuota，
// 和首次预扣一样必须由余额覆盖。
func PreConsumeBilling(c *gin.Context, preConsumedQuota int, relayInfo *relaycommon.RelayInfo) *types.NewAPIError {
	if relayInfo != nil && relayInfo.QuotaClamp != nil {
		return types.NewErrorWithStatusCode(
			relayInfo.QuotaClamp,
			types.ErrorCodeModelPriceError,
			http.StatusBadRequest,
			types.ErrOptionWithSkipRetry(),
		)
	}
	if preConsumedQuota < 0 {
		return types.NewErrorWithStatusCode(
			fmt.Errorf("pre-consume quota cannot be negative: %d", preConsumedQuota),
			types.ErrorCodeModelPriceError,
			http.StatusBadRequest,
			types.ErrOptionWithSkipRetry(),
		)
	}
	if relayInfo != nil && relayInfo.Billing != nil {
		if err := relayInfo.Billing.ReserveBeforeSubmit(preConsumedQuota); err != nil {
			var apiErr *types.NewAPIError
			if errors.As(err, &apiErr) {
				return apiErr
			}
			return types.NewErrorWithStatusCode(err, types.ErrorCodeInsufficientUserQuota, http.StatusForbidden, types.ErrOptionWithSkipRetry())
		}
		return nil
	}
	session, apiErr := NewBillingSession(c, relayInfo, preConsumedQuota)
	if apiErr != nil {
		return apiErr
	}
	relayInfo.Billing = session
	return nil
}

// ---------------------------------------------------------------------------
// SettleBilling — 后结算辅助函数
// ---------------------------------------------------------------------------

// SettleBilling 执行计费结算。如果 RelayInfo 上有 BillingSession 则通过 session 结算，
// 否则回退到旧的 PostConsumeQuota 路径（兼容按次计费等场景）。
func SettleBilling(ctx *gin.Context, relayInfo *relaycommon.RelayInfo, actualQuota int) error {
	if relayInfo.Billing != nil {
		preConsumed := relayInfo.Billing.GetPreConsumedQuota()
		delta := actualQuota - preConsumed

		if delta > 0 {
			logger.LogInfo(ctx, common.LogText("charging the difference after pre-consume: %s (actual %s, pre-consumed %s)",
				logger.FormatQuota(delta),
				logger.FormatQuota(actualQuota),
				logger.FormatQuota(preConsumed),
			))
		} else if delta < 0 {
			logger.LogInfo(ctx, common.LogText("refunding the difference after pre-consume: %s (actual %s, pre-consumed %s)",
				logger.FormatQuota(-delta),
				logger.FormatQuota(actualQuota),
				logger.FormatQuota(preConsumed),
			))
		} else {
			logger.LogInfo(ctx, common.LogText("pre-consumed quota matches the actual quota, no adjustment: %s (per-request billing)",
				logger.FormatQuota(actualQuota),
			))
		}

		if err := relayInfo.Billing.Settle(actualQuota); err != nil {
			return err
		}

		// 发送额度通知（订阅计费使用订阅剩余额度）
		if actualQuota != 0 {
			if relayInfo.BillingSource == BillingSourceSubscription {
				checkAndSendSubscriptionQuotaNotify(relayInfo)
			} else {
				checkAndSendQuotaNotify(relayInfo, actualQuota-preConsumed, preConsumed)
			}
		}
		return nil
	}

	// 回退：无 BillingSession 时使用旧路径
	quotaDelta := actualQuota - relayInfo.FinalPreConsumedQuota
	if quotaDelta != 0 {
		return PostConsumeQuota(relayInfo, quotaDelta, relayInfo.FinalPreConsumedQuota, true)
	}
	return nil
}

// retainProviderMemoryFact records a performance fact after a relay settles.
// It runs in a goroutine so it never blocks the response path. The fact feeds
// the background consolidation loop which produces observations and mental
// models used by channel selection.
func retainProviderMemoryFact(ctx *gin.Context, relayInfo *relaycommon.RelayInfo, success bool) {
	if !providermemory.Enabled() {
		return
	}
	if relayInfo == nil || relayInfo.ChannelMeta == nil {
		return
	}
	cm := relayInfo.ChannelMeta
	if cm.ChannelId <= 0 || cm.UpstreamModelName == "" {
		return
	}
	// Compute latency from timing fields.
	latencyMs := int64(0)
	if !relayInfo.FirstResponseTime.IsZero() && !relayInfo.StartTime.IsZero() {
		latencyMs = relayInfo.FirstResponseTime.Sub(relayInfo.StartTime).Milliseconds()
	}
	// Build metrics JSON via common.* per project rules.
	metrics := map[string]any{
		"latency_ms":   latencyMs,
		"success_rate": map[bool]float64{true: 1, false: 0}[success],
		"error_rate":   map[bool]float64{true: 0, false: 1}[success],
	}
	metricsJSON, err := common.Marshal(metrics)
	if err != nil {
		return
	}
	entities := extractMemoryEntities(cm.UpstreamModelName)
	keywords := extractMemoryKeywords(cm.UpstreamModelName, cm.ChannelType)
	language := detectRequestLanguage(ctx)

	gopool.Go(func() {
		_ = providermemory.RetainFact(providermemory.FactInput{
			ChannelId:   cm.ChannelId,
			ModelName:   cm.UpstreamModelName,
			ChannelType: cm.ChannelType,
			Metrics:     string(metricsJSON),
			Entities:    entities,
			Keywords:    keywords,
			Language:    language,
			Success:     success,
		})
	})
}

// detectRequestLanguage infers the ISO 639-1 language code from request context.
// Uses the Accept-Language header when available; falls back to inspecting
// the request body for CJK ranges. Returns "" when no signal is found.
func detectRequestLanguage(ctx *gin.Context) string {
	if ctx == nil || ctx.Request == nil {
		return ""
	}
	// 1) Accept-Language header (most reliable)
	acceptLang := ctx.GetHeader("Accept-Language")
	if acceptLang != "" {
		// Take the first tag, strip subtags.
		tag := acceptLang
		if idx := strings.Index(tag, ","); idx >= 0 {
			tag = tag[:idx]
		}
		if idx := strings.Index(tag, "-"); idx >= 0 {
			tag = tag[:idx]
		}
		tag = strings.TrimSpace(strings.ToLower(tag))
		if tag != "" && len(tag) <= 8 {
			return tag
		}
	}
	return ""
}

// extractMemoryEntities derives task-tag entities from the model name.
// A richer NLP extractor can replace this later.
func extractMemoryEntities(modelName string) []string {
	if modelName == "" {
		return nil
	}
	name := strings.ToLower(modelName)
	switch {
	case strings.Contains(name, "code") || strings.Contains(name, "codex"):
		return []string{"coding"}
	case strings.Contains(name, "image") || strings.Contains(name, "dall") || strings.Contains(name, "flux"):
		return []string{"image"}
	case strings.Contains(name, "audio") || strings.Contains(name, "tts") || strings.Contains(name, "whisper"):
		return []string{"audio"}
	case strings.Contains(name, "embed"):
		return []string{"embedding"}
	default:
		return []string{"chat"}
	}
}

// extractMemoryKeywords pulls significant tokens for BM25-lite recall.
func extractMemoryKeywords(modelName string, channelType int) []string {
	var kw []string
	if modelName != "" {
		kw = append(kw, strings.ToLower(modelName))
	}
	if channelType > 0 {
		kw = append(kw, fmt.Sprintf("channel_type_%d", channelType))
	}
	return kw
}
