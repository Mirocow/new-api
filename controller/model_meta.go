package controller

import (
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)


// ChannelInfo represents channel information with health metrics for a model.
type ChannelInfo struct {
	ID                 int     `json:"id"`
	Name               string  `json:"name"`
	Type               int     `json:"type"`
	Group              string  `json:"group"`
	Status             int     `json:"status"`
	Priority           int64   `json:"priority"`
	Weight             int     `json:"weight"`
	IsEnabled          bool    `json:"is_enabled"`
	PenaltyCount       int     `json:"penalty_count"`
	PenaltyUntil       int64   `json:"penalty_until"`
	PenaltyReason      string  `json:"penalty_reason"`
	// Health metrics from provider memory
	AvgLatencyMs       float64 `json:"avg_latency_ms,omitempty"`
	ErrorRate          float64 `json:"error_rate,omitempty"`
	SuccessRate        float64 `json:"success_rate,omitempty"`
	CostPer1k          float64 `json:"cost_per_1k,omitempty"`
	SampleSize         int     `json:"sample_size,omitempty"`
	// Recommended priority based on health metrics
	RecommendedPriority  int     `json:"recommended_priority,omitempty"`
}


// GetAllModelsMeta 获取模型列表（分页）
func GetAllModelsMeta(c *gin.Context) {
	listModelsMeta(c, "", "")
}

// SearchModelsMeta 搜索模型列表
func SearchModelsMeta(c *gin.Context) {
	listModelsMeta(c, c.Query("keyword"), c.Query("vendor"))
}

func listModelsMeta(c *gin.Context, keyword, vendor string) {
	squareState := model.ModelSquareState(c.Query("square_state"))
	switch squareState {
	case "", model.ModelSquareVisible, model.ModelSquareUnavailable, model.ModelSquareHidden, model.ModelSquarePartial:
	default:
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid model square state"})
		return
	}

	pageInfo := common.GetPageQuery(c)
	if squareState != "" && (pageInfo.GetPage() < 1 || pageInfo.GetPageSize() < 1) {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid pagination"})
		return
	}
	offset, limit := pageInfo.GetStartIdx(), pageInfo.GetPageSize()
	if squareState != "" {
		// Visibility depends on live channels and metadata rules. Filter the
		// enriched candidate set before counting and paginating the results.
		offset, limit = 0, -1
	}
	search := model.SearchModels
	if c.Query("include_channel_models") == "true" {
		search = model.SearchModelsWithChannels
	}
	modelsMeta, total, err := search(keyword, vendor, c.Query("status"), c.Query("sync_official"), offset, limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := enrichModels(modelsMeta); err != nil {
		common.ApiError(c, err)
		return
	}
	if squareState != "" {
		filtered := make([]*model.Model, 0, len(modelsMeta))
		for _, metadata := range modelsMeta {
			if metadata.SquareState == squareState {
				filtered = append(filtered, metadata)
			}
		}
		total = int64(len(filtered))
		start := len(filtered)
		if pageInfo.GetPage()-1 <= len(filtered)/pageInfo.GetPageSize() {
			start = (pageInfo.GetPage() - 1) * pageInfo.GetPageSize()
		}
		end := min(start+pageInfo.GetPageSize(), len(filtered))
		modelsMeta = filtered[start:end]
	}

	vendorCounts, _ := model.GetVendorModelCounts()
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(modelsMeta)
	common.ApiSuccess(c, gin.H{
		"items":         modelsMeta,
		"total":         total,
		"page":          pageInfo.GetPage(),
		"page_size":     pageInfo.GetPageSize(),
		"vendor_counts": vendorCounts,
	})
}

// GetModelMeta 根据 ID 获取单条模型信息
func GetModelMeta(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var m model.Model
	if err := model.DB.First(&m, id).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	if err := enrichModels([]*model.Model{&m}); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, &m)
}

// CreateModelMeta 新建模型
func CreateModelMeta(c *gin.Context) {
	var m model.Model
	if err := c.ShouldBindJSON(&m); err != nil {
		common.ApiError(c, err)
		return
	}
	if m.ModelName == "" {
		common.ApiErrorT(c, "Model name cannot be empty")
		return
	}
	if err := model.ValidateMetadataValues(model.MetadataValues{Endpoints: m.Endpoints, Status: m.Status, NameRule: m.NameRule}); err != nil {
		common.ApiError(c, err)
		return
	}
	// 名称冲突检查
	if dup, err := model.IsModelNameDuplicated(0, m.ModelName); err != nil {
		common.ApiError(c, err)
		return
	} else if dup {
		common.ApiErrorT(c, "Model name already exists")
		return
	}

	if err := m.Insert(); err != nil {
		common.ApiError(c, err)
		return
	}
	model.RefreshPricing()
	m.HasMetadata = m.Id > 0
	common.ApiSuccess(c, &m)
}

// UpdateModelMeta 更新模型
func UpdateModelMeta(c *gin.Context) {
	statusOnly := c.Query("status_only") == "true"

	var m model.Model
	if err := c.ShouldBindJSON(&m); err != nil {
		common.ApiError(c, err)
		return
	}
	if m.Id == 0 {
		common.ApiErrorT(c, "Missing model ID")
		return
	}

	if statusOnly {
		if m.Status != 0 && m.Status != 1 {
			common.ApiErrorMsg(c, "invalid catalog visibility")
			return
		}
		// 只更新状态，防止误清空其他字段
		if err := model.DB.Model(&model.Model{}).Where("id = ?", m.Id).Update("status", m.Status).Error; err != nil {
			common.ApiError(c, err)
			return
		}
	} else {
		if strings.TrimSpace(m.ModelName) == "" {
			common.ApiErrorT(c, "Model name cannot be empty")
			return
		}
		if err := model.ValidateMetadataValues(model.MetadataValues{Endpoints: m.Endpoints, Status: m.Status, NameRule: m.NameRule}); err != nil {
			common.ApiError(c, err)
			return
		}
		// 名称冲突检查
		if dup, err := model.IsModelNameDuplicated(m.Id, m.ModelName); err != nil {
			common.ApiError(c, err)
			return
		} else if dup {
			common.ApiErrorT(c, "Model name already exists")
			return
		}

		if err := m.Update(); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	model.RefreshPricing()
	m.HasMetadata = m.Id > 0
	common.ApiSuccess(c, &m)
}

// DeleteModelMeta 删除模型
func DeleteModelMeta(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	removeFromChannels, err := strconv.ParseBool(c.DefaultQuery("remove_from_channels", "false"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	removePricing, err := strconv.ParseBool(c.DefaultQuery("remove_pricing", "false"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if removePricing && c.GetInt("role") != common.RoleRootUser {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "Model pricing is managed by a super administrator."})
		return
	}
	result, err := model.DeleteModelMetadata([]int{id}, removeFromChannels, removePricing)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "model.delete", map[string]any{"model_ids": []int{id}, "remove_from_channels": removeFromChannels, "remove_pricing": removePricing, "updated_channels": result.UpdatedChannels})
	common.ApiSuccess(c, result)
}

func BatchDeleteModelMeta(c *gin.Context) {
	var request struct {
		ModelIDs           []int `json:"model_ids"`
		RemoveFromChannels bool  `json:"remove_from_channels"`
		RemovePricing      bool  `json:"remove_pricing"`
	}
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiError(c, err)
		return
	}
	if request.RemovePricing && c.GetInt("role") != common.RoleRootUser {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "Model pricing is managed by a super administrator."})
		return
	}
	result, err := model.DeleteModelMetadata(request.ModelIDs, request.RemoveFromChannels, request.RemovePricing)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "model.delete_batch", map[string]any{"model_ids": request.ModelIDs, "remove_from_channels": request.RemoveFromChannels, "remove_pricing": request.RemovePricing, "updated_channels": result.UpdatedChannels})
	common.ApiSuccess(c, result)
}

// enrichModels keeps configured endpoints intact and derives connections from
// enabled routes, including hidden or unpriced models absent from the catalog.
func enrichModels(models []*model.Model) error {
	if len(models) == 0 {
		return nil
	}
	configured, err := model.GetConfiguredModelChannels()
	if err != nil {
		return err
	}
	for _, metadata := range models {
		if metadata == nil {
			continue
		}
		metadata.HasMetadata = metadata.Id > 0
		channelIDs := make(map[int]struct{})
		for name, ids := range configured {
			if metadata.MatchesName(name) {
				for _, id := range ids {
					channelIDs[id] = struct{}{}
				}
			}
		}
		metadata.ConfiguredChannelCount = len(channelIDs)
	}
	connections, err := model.GetModelConnections()
	if err != nil {
		return err
	}
	if err := model.FillModelSquareStates(models, configured, connections); err != nil {
		return err
	}
	for _, metadata := range models {
		if metadata == nil {
			continue
		}
		channels := make(map[int]model.BoundChannel)
		groups := make(map[string]bool)
		names := make(map[string]bool)
		endpoints := make(map[string]bool)
		quotas := make(map[int]bool)
		for _, connection := range connections {
			name := connection.Model
			if !metadata.MatchesName(name) {
				continue
			}
			names[name] = true
			groups[connection.Group] = true
			channels[connection.ChannelId] = model.BoundChannel{Name: connection.ChannelName, Type: connection.ChannelType}
			for _, endpoint := range model.GetModelSupportEndpointTypes(name) {
				endpoints[string(endpoint)] = true
			}
			for _, quota := range model.GetModelQuotaTypes(name) {
				quotas[quota] = true
			}
		}
		metadata.BoundChannels = nil
		metadata.EnableGroups = nil
		metadata.SupportedEndpoints = nil
		metadata.QuotaTypes = nil
		metadata.MatchedModels = nil
		for _, channel := range channels {
			metadata.BoundChannels = append(metadata.BoundChannels, channel)
		}
		sort.Slice(metadata.BoundChannels, func(i, j int) bool {
			a, b := metadata.BoundChannels[i], metadata.BoundChannels[j]
			if a.Name == b.Name {
				return a.Type < b.Type
			}
			return a.Name < b.Name
		})
		for group := range groups {
			metadata.EnableGroups = append(metadata.EnableGroups, group)
		}
		for endpoint := range endpoints {
			metadata.SupportedEndpoints = append(metadata.SupportedEndpoints, endpoint)
		}
		for quota := range quotas {
			metadata.QuotaTypes = append(metadata.QuotaTypes, quota)
		}
		sort.Strings(metadata.EnableGroups)
		sort.Strings(metadata.SupportedEndpoints)
		sort.Ints(metadata.QuotaTypes)
		if metadata.NameRule != model.NameRuleExact {
			for name := range names {
				metadata.MatchedModels = append(metadata.MatchedModels, name)
			}
			sort.Strings(metadata.MatchedModels)
			metadata.MatchedCount = len(names)
		}
	}
	return nil
}

// GetModelChannels returns channels configured for a specific model with their
// priority, weight, and health metrics.
func GetModelChannels(c *gin.Context) {
	modelName := c.Param("model_name")
	if modelName == "" {
		common.ApiErrorT(c, "Model name is required")
		return
	}

	// Get all channels that have this model
	var channels []model.Channel
	if err := model.DB.Select("id", "name", "type", "group", "status", "priority", "weight", "other_settings").
		Find(&channels).Error; err != nil {
		common.ApiError(c, err)
		return
	}



	// Get penalty info for all channels
	penaltyCounts := make(map[int]int)
	penaltyUntils := make(map[int]int64)
	penaltyReasons := make(map[int]string)
	for _, ch := range channels {
		penaltyCounts[ch.Id] = model.GetPenaltyCount(ch.Id)
		penaltyUntils[ch.Id] = int64(model.GetPenaltyRemainingSeconds(ch.Id))
		penaltyReasons[ch.Id] = model.GetPenaltyReason(ch.Id)
	}

	// Get health metrics from provider memory observations
	healthMetrics := make(map[int]map[string]float64)
	observations, _ := model.RecallActiveObservations(model.ProviderRecallFilter{
		ModelName: modelName,
		Limit:     1000,
	})
	for _, obs := range observations {
		var metrics map[string]float64
		if err := common.Unmarshal([]byte(obs.Metrics), &metrics); err == nil {
			healthMetrics[obs.ChannelId] = metrics
		}
	}

	// Filter channels that have this model and build response
	var result []ChannelInfo
	for _, ch := range channels {
		models := ch.GetModels()
		hasModel := false
		for _, m := range models {
			if m == modelName {
				hasModel = true
				break
			}
		}
		if !hasModel {
			continue
		}

		info := ChannelInfo{
			ID:             ch.Id,
			Name:           ch.Name,
			Type:           ch.Type,
			Group:          ch.Group,
			Status:         ch.Status,
			Priority:       ch.GetPriority(),
			Weight:         ch.GetWeight(),
			IsEnabled:      ch.Status == common.ChannelStatusEnabled,
			PenaltyCount:   penaltyCounts[ch.Id],
			PenaltyUntil:   penaltyUntils[ch.Id],
			PenaltyReason:  penaltyReasons[ch.Id],
		}

		// Add health metrics if available
		if metrics, ok := healthMetrics[ch.Id]; ok {
			info.AvgLatencyMs = metrics["latency_ms"]
			info.ErrorRate = metrics["error_rate"]
			info.SuccessRate = metrics["success_rate"]
			info.CostPer1k = metrics["cost_per_1k"]
			info.SampleSize = int(metrics["sample_size"])
		}

		// Calculate recommended priority based on health metrics
		info.RecommendedPriority = calculateRecommendedPriority(info)

		result = append(result, info)
	}

	// Sort by priority (highest first), then by weight
	sort.Slice(result, func(i, j int) bool {
		if result[i].Priority != result[j].Priority {
			return result[i].Priority > result[j].Priority
		}
		return result[i].Weight > result[j].Weight
	})

	common.ApiSuccess(c, gin.H{
		"model_name": modelName,
		"channels":   result,
		"total":      len(result),
	})
}
// calculateRecommendedPriority calculates a recommended priority based on health metrics.
// Higher priority = better (lower latency, lower error rate, higher success rate).
// Returns a priority value between 0 and 100.
func calculateRecommendedPriority(info ChannelInfo) int {
	basePriority := 50 // Default middle priority
	
	// If no health data, return base priority
	if info.SampleSize == 0 {
		return basePriority
	}
	
	// Adjust based on success rate (0-1)
	if info.SuccessRate > 0 {
		// Success rate contribution: 0-30 points
		successBonus := int(info.SuccessRate * 30)
		basePriority += successBonus
	}
	
	// Adjust based on error rate (0-1) - lower is better
	if info.ErrorRate > 0 {
		// Error rate penalty: 0-20 points
		errorPenalty := int(info.ErrorRate * 20)
		basePriority -= errorPenalty
	}
	
	// Adjust based on latency - lower is better
	// Assume good latency is < 1000ms, bad is > 5000ms
	if info.AvgLatencyMs > 0 {
		if info.AvgLatencyMs < 1000 {
			basePriority += 10 // Fast
		} else if info.AvgLatencyMs < 3000 {
			basePriority += 5 // Acceptable
		} else if info.AvgLatencyMs > 10000 {
			basePriority -= 10 // Slow
		}
	}
	
	// Penalty for penalized channels
	if info.PenaltyCount > 0 {
		basePriority -= info.PenaltyCount * 5
	}
	
	// Clamp to 0-100
	if basePriority < 0 {
		basePriority = 0
	}
	if basePriority > 100 {
		basePriority = 100
	}
	
	return basePriority
}
// GetModelRequestHistory returns recent request logs for a model showing which channels served it.
func GetModelRequestHistory(c *gin.Context) {
	modelName := c.Param("model_name")
	if modelName == "" {
		common.ApiErrorT(c, "Model name is required")
		return
	}

	limit := 100
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	logs, err := model.GetModelRequestHistory(modelName, limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	type LogEntry struct {
		Id                int    `json:"id"`
		CreatedAt         int64  `json:"created_at"`
		ModelName         string `json:"model_name"`
		ChannelId         int    `json:"channel_id"`
		ChannelName       string `json:"channel_name"`
		Quota             int    `json:"quota"`
		PromptTokens      int    `json:"prompt_tokens"`
		CompletionTokens  int    `json:"completion_tokens"`
		UseTime           int    `json:"use_time"`
		IsStream          bool   `json:"is_stream"`
		Group             string `json:"group"`
		Ip                string `json:"ip"`
		RequestId         string `json:"request_id"`
		UpstreamRequestId string `json:"upstream_request_id"`
		Other             string `json:"other"`
		// Parsed from Other
		RejectReason string `json:"reject_reason,omitempty"`
		ErrorMessage string `json:"error_message,omitempty"`
	}

	var result []LogEntry
	for _, log := range logs {
		rejectReason, errorMessage := parseLogOther(log.Other)
		result = append(result, LogEntry{
			Id:                log.Id,
			CreatedAt:         log.CreatedAt,
			ModelName:         log.ModelName,
			ChannelId:         log.ChannelId,
			ChannelName:       log.ChannelName,
			Quota:             log.Quota,
			PromptTokens:      log.PromptTokens,
			CompletionTokens:  log.CompletionTokens,
			UseTime:           log.UseTime,
			IsStream:          log.IsStream,
			Group:             log.Group,
			Ip:                log.Ip,
			RequestId:         log.RequestId,
			UpstreamRequestId: log.UpstreamRequestId,
			Other:             log.Other,
			RejectReason:      rejectReason,
			ErrorMessage:      errorMessage,
		})
	}

	common.ApiSuccess(c, gin.H{
		"model_name": modelName,
		"logs":       result,
		"total":      len(result),
	})
}

// parseLogOther extracts reject_reason and error_message from the Other JSON field.
func parseLogOther(other string) (rejectReason, errorMessage string) {
	if other == "" {
		return "", ""
	}
	var data map[string]json.RawMessage
	if err := common.UnmarshalJsonStr(other, &data); err != nil {
		return "", ""
	}
	// Check admin_info for reject_reason
	if rawAdmin, ok := data["admin_info"]; ok {
		var adminInfo map[string]json.RawMessage
		if err := common.Unmarshal(rawAdmin, &adminInfo); err == nil {
			if rawReject, ok := adminInfo["reject_reason"]; ok {
				var reject string
				if err := common.Unmarshal(rawReject, &reject); err == nil {
					rejectReason = reject
				}
			}
			// Also check for channel_name in admin_info (legacy)
			if rawChName, ok := adminInfo["channel_name"]; ok {
				var chName string
				if err := common.Unmarshal(rawChName, &chName); err == nil && errorMessage == "" {
					errorMessage = "Channel: " + chName
				}
			}
		}
	}
	// Check public content_parts for error messages
	if rawContent, ok := data["content_parts"]; ok {
		var contentParts []map[string]any
		if err := common.Unmarshal(rawContent, &contentParts); err == nil {
			for _, part := range contentParts {
				if errMsg, ok := part["error"].(string); ok && errMsg != "" {
					if errorMessage == "" {
						errorMessage = errMsg
					}
				}
			}
		}
	}
	return rejectReason, errorMessage
}
// GetModelFailoverHistory returns recent failover/switch events for a model.
// A failover occurs when a request is retried on a different channel (same RequestId, different ChannelId).
func GetModelFailoverHistory(c *gin.Context) {
	modelName := c.Param("model_name")
	if modelName == "" {
		common.ApiErrorT(c, "Model name is required")
		return
	}

	limit := 200 // Fetch more logs to find failover chains
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	logs, err := model.GetModelRequestHistory(modelName, limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	// Group logs by RequestId to find failover chains
	requestGroups := make(map[string][]*model.Log)
	for _, log := range logs {
		if log.RequestId != "" {
			requestGroups[log.RequestId] = append(requestGroups[log.RequestId], log)
		}
	}

	type FailoverEvent struct {
		RequestId        string   `json:"request_id"`
		ModelName        string   `json:"model_name"`
		TotalAttempts    int      `json:"total_attempts"`
		ChannelsTried    []int    `json:"channels_tried"`
		ChannelNames     []string `json:"channel_names"`
		FinalChannelId   int      `json:"final_channel_id"`
		FinalChannelName string   `json:"final_channel_name"`
		Success          bool     `json:"success"`
		FirstAttemptAt   int64    `json:"first_attempt_at"`
		LastAttemptAt    int64    `json:"last_attempt_at"`
		RejectReasons    []string `json:"reject_reasons"`
		ErrorMessages    []string `json:"error_messages"`
		DurationMs       int64    `json:"duration_ms"`
	}

	var failovers []FailoverEvent
	for requestId, groupLogs := range requestGroups {
		if len(groupLogs) <= 1 {
			continue // No failover, only single attempt
		}

		// Sort by CreatedAt
		sort.Slice(groupLogs, func(i, j int) bool {
			return groupLogs[i].CreatedAt < groupLogs[j].CreatedAt
		})

		channelsTried := make([]int, 0, len(groupLogs))
		channelNames := make([]string, 0, len(groupLogs))
		rejectReasons := make([]string, 0, len(groupLogs))
		errorMessages := make([]string, 0, len(groupLogs))
		seenChannels := make(map[int]bool)

		for _, log := range groupLogs {
			if !seenChannels[log.ChannelId] {
				channelsTried = append(channelsTried, log.ChannelId)
				channelNames = append(channelNames, log.ChannelName)
				seenChannels[log.ChannelId] = true
			}
			rejectReason, errorMessage := parseLogOther(log.Other)
			if rejectReason != "" {
				rejectReasons = append(rejectReasons, rejectReason)
			}
			if errorMessage != "" {
				errorMessages = append(errorMessages, errorMessage)
			}
		}

		finalLog := groupLogs[len(groupLogs)-1]
		failovers = append(failovers, FailoverEvent{
			RequestId:        requestId,
			ModelName:        modelName,
			TotalAttempts:    len(groupLogs),
			ChannelsTried:    channelsTried,
			ChannelNames:     channelNames,
			FinalChannelId:   finalLog.ChannelId,
			FinalChannelName: finalLog.ChannelName,
			Success:          finalLog.Quota > 0 || finalLog.PromptTokens > 0 || finalLog.CompletionTokens > 0,
			FirstAttemptAt:   groupLogs[0].CreatedAt,
			LastAttemptAt:    finalLog.CreatedAt,
			RejectReasons:    rejectReasons,
			ErrorMessages:    errorMessages,
			DurationMs:       finalLog.CreatedAt - groupLogs[0].CreatedAt,
		})
	}

	// Sort by LastAttemptAt desc (most recent first)
	sort.Slice(failovers, func(i, j int) bool {
		return failovers[i].LastAttemptAt > failovers[j].LastAttemptAt
	})

	// Limit to 10 most recent
	if len(failovers) > 10 {
		failovers = failovers[:10]
	}

	common.ApiSuccess(c, gin.H{
		"model_name": modelName,
		"failovers":  failovers,
		"total":      len(failovers),
	})
}
// HandleModelRoutes handles model routes with catch-all parameter for model names containing slashes.
// It parses the model_path to determine the model name and the requested action (channels, history, failovers).
func HandleModelRoutes(c *gin.Context) {
	modelPath := c.Param("model_path")
	if modelPath == "" {
		common.ApiErrorT(c, "Model name is required")
		return
	}

	// Parse the path: model_name/action where action is channels, history, or failovers
	// The path comes in as "model_name/action" or just "model_name"
	var modelName, action string
	if idx := strings.Index(modelPath, "/"); idx >= 0 {
		modelName = modelPath[:idx]
		action = modelPath[idx+1:]
	} else {
		modelName = modelPath
		action = ""
	}

	if modelName == "" {
		common.ApiErrorT(c, "Model name is required")
		return
	}

	switch action {
	case "channels":
		GetModelChannelsInternal(c, modelName)
	case "history":
		GetModelRequestHistoryInternal(c, modelName)
	case "failovers":
		GetModelFailoverHistoryInternal(c, modelName)
	default:
		common.ApiErrorT(c, "Invalid model route")
	}
}

// GetModelChannelsInternal is the internal implementation for getting model channels.
func GetModelChannelsInternal(c *gin.Context, modelName string) {
	if modelName == "" {
		common.ApiErrorT(c, "Model name is required")
		return
	}

	// Get all channels that have this model
	var channels []model.Channel
	if err := model.DB.Select("id", "name", "type", "group", "status", "priority", "weight", "other_settings").
		Find(&channels).Error; err != nil {
		common.ApiError(c, err)
		return
	}

	// Get penalty info for all channels
	penaltyCounts := make(map[int]int)
	penaltyUntils := make(map[int]int64)
	penaltyReasons := make(map[int]string)
	for _, ch := range channels {
		penaltyCounts[ch.Id] = model.GetPenaltyCount(ch.Id)
		penaltyUntils[ch.Id] = int64(model.GetPenaltyRemainingSeconds(ch.Id))
		penaltyReasons[ch.Id] = model.GetPenaltyReason(ch.Id)
	}

	// Get health metrics from provider memory observations
	healthMetrics := make(map[int]map[string]float64)
	observations, _ := model.RecallActiveObservations(model.ProviderRecallFilter{
		ModelName: modelName,
		Limit:     1000,
	})
	for _, obs := range observations {
		var metrics map[string]float64
		if err := common.Unmarshal([]byte(obs.Metrics), &metrics); err == nil {
			healthMetrics[obs.ChannelId] = metrics
		}
	}

	// Filter channels that have this model and build response
	var result []ChannelInfo
	for _, ch := range channels {
		models := ch.GetModels()
		hasModel := false
		for _, m := range models {
			if m == modelName {
				hasModel = true
				break
			}
		}
		if !hasModel {
			continue
		}

		info := ChannelInfo{
			ID:             ch.Id,
			Name:           ch.Name,
			Type:           ch.Type,
			Group:          ch.Group,
			Status:         ch.Status,
			Priority:       ch.GetPriority(),
			Weight:         ch.GetWeight(),
			IsEnabled:      ch.Status == common.ChannelStatusEnabled,
			PenaltyCount:   penaltyCounts[ch.Id],
			PenaltyUntil:   penaltyUntils[ch.Id],
			PenaltyReason:  penaltyReasons[ch.Id],
		}

		// Add health metrics if available
		if metrics, ok := healthMetrics[ch.Id]; ok {
			info.AvgLatencyMs = metrics["latency_ms"]
			info.ErrorRate = metrics["error_rate"]
			info.SuccessRate = metrics["success_rate"]
			info.CostPer1k = metrics["cost_per_1k"]
			info.SampleSize = int(metrics["sample_size"])
			if info.SuccessRate > 0 {
				info.RecommendedPriority = int(info.SuccessRate * 100)
			}
		}

		result = append(result, info)
	}

	common.ApiSuccess(c, gin.H{
		"model_name": modelName,
		"channels":   result,
		"total":      len(result),
	})
}

// GetModelRequestHistoryInternal is the internal implementation for getting model request history.
func GetModelRequestHistoryInternal(c *gin.Context, modelName string) {
	if modelName == "" {
		common.ApiErrorT(c, "Model name is required")
		return
	}

	limit := 100
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	logs, err := model.GetModelRequestHistory(modelName, limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	type LogEntry struct {
		Id                int    `json:"id"`
		CreatedAt         int64  `json:"created_at"`
		ModelName         string `json:"model_name"`
		ChannelId         int    `json:"channel_id"`
		ChannelName       string `json:"channel_name"`
		Quota             int    `json:"quota"`
		PromptTokens      int    `json:"prompt_tokens"`
		CompletionTokens  int    `json:"completion_tokens"`
		UseTime           int    `json:"use_time"`
		IsStream          bool   `json:"is_stream"`
		Group             string `json:"group"`
		Ip                string `json:"ip"`
		RequestId         string `json:"request_id"`
		UpstreamRequestId string `json:"upstream_request_id"`
		Other             string `json:"other"`
		// Parsed from Other
		RejectReason string `json:"reject_reason,omitempty"`
		ErrorMessage string `json:"error_message,omitempty"`
	}

	var result []LogEntry
	for _, log := range logs {
		rejectReason, errorMessage := parseLogOther(log.Other)
		result = append(result, LogEntry{
			Id:                log.Id,
			CreatedAt:         log.CreatedAt,
			ModelName:         log.ModelName,
			ChannelId:         log.ChannelId,
			ChannelName:       log.ChannelName,
			Quota:             log.Quota,
			PromptTokens:      log.PromptTokens,
			CompletionTokens:  log.CompletionTokens,
			UseTime:           log.UseTime,
			IsStream:          log.IsStream,
			Group:             log.Group,
			Ip:                log.Ip,
			RequestId:         log.RequestId,
			UpstreamRequestId: log.UpstreamRequestId,
			Other:             log.Other,
			RejectReason:      rejectReason,
			ErrorMessage:      errorMessage,
		})
	}

	common.ApiSuccess(c, gin.H{
		"model_name": modelName,
		"logs":       result,
		"total":      len(result),
	})
}

// GetModelFailoverHistoryInternal is the internal implementation for getting model failover history.
func GetModelFailoverHistoryInternal(c *gin.Context, modelName string) {
	if modelName == "" {
		common.ApiErrorT(c, "Model name is required")
		return
	}

	limit := 200 // Fetch more logs to find failover chains
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	logs, err := model.GetModelRequestHistory(modelName, limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	// Group logs by RequestId to find failover chains
	requestGroups := make(map[string][]*model.Log)
	for _, log := range logs {
		if log.RequestId != "" {
			requestGroups[log.RequestId] = append(requestGroups[log.RequestId], log)
		}
	}

	type FailoverEvent struct {
		RequestId        string   `json:"request_id"`
		ModelName        string   `json:"model_name"`
		TotalAttempts    int      `json:"total_attempts"`
		ChannelsTried    []int    `json:"channels_tried"`
		ChannelNames     []string `json:"channel_names"`
		FinalChannelId   int      `json:"final_channel_id"`
		FinalChannelName string   `json:"final_channel_name"`
		Success          bool     `json:"success"`
		FirstAttemptAt   int64    `json:"first_attempt_at"`
		LastAttemptAt    int64    `json:"last_attempt_at"`
		RejectReasons    []string `json:"reject_reasons"`
		ErrorMessages    []string `json:"error_messages"`
		DurationMs       int64    `json:"duration_ms"`
	}

	var failovers []FailoverEvent
	for requestId, groupLogs := range requestGroups {
		if len(groupLogs) < 2 {
			continue // Not a failover, only single attempt
		}

		// Sort by CreatedAt asc to get chronological order
		sort.Slice(groupLogs, func(i, j int) bool {
			return groupLogs[i].CreatedAt < groupLogs[j].CreatedAt
		})

		channelsTried := make([]int, 0, len(groupLogs))
		channelNames := make([]string, 0, len(groupLogs))
		rejectReasons := make([]string, 0, len(groupLogs))
		errorMessages := make([]string, 0, len(groupLogs))
		seenChannels := make(map[int]bool)

		for _, log := range groupLogs {
			if !seenChannels[log.ChannelId] {
				channelsTried = append(channelsTried, log.ChannelId)
				channelNames = append(channelNames, log.ChannelName)
				seenChannels[log.ChannelId] = true
			}
			rejectReason, errorMessage := parseLogOther(log.Other)
			if rejectReason != "" {
				rejectReasons = append(rejectReasons, rejectReason)
			}
			if errorMessage != "" {
				errorMessages = append(errorMessages, errorMessage)
			}
		}

		finalLog := groupLogs[len(groupLogs)-1]
		failovers = append(failovers, FailoverEvent{
			RequestId:        requestId,
			ModelName:        modelName,
			TotalAttempts:    len(groupLogs),
			ChannelsTried:    channelsTried,
			ChannelNames:     channelNames,
			FinalChannelId:   finalLog.ChannelId,
			FinalChannelName: finalLog.ChannelName,
			Success:          finalLog.Quota > 0 || finalLog.PromptTokens > 0 || finalLog.CompletionTokens > 0,
			FirstAttemptAt:   groupLogs[0].CreatedAt,
			LastAttemptAt:    finalLog.CreatedAt,
			RejectReasons:    rejectReasons,
			ErrorMessages:    errorMessages,
			DurationMs:       finalLog.CreatedAt - groupLogs[0].CreatedAt,
		})
	}

	// Sort by LastAttemptAt desc (most recent first)
	sort.Slice(failovers, func(i, j int) bool {
		return failovers[i].LastAttemptAt > failovers[j].LastAttemptAt
	})

	// Limit to 10 most recent
	if len(failovers) > 10 {
		failovers = failovers[:10]
	}

	common.ApiSuccess(c, gin.H{
		"model_name": modelName,
		"failovers":  failovers,
		"total":      len(failovers),
	})
}