package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// GetProviderMemoryConfig returns current provider memory configuration.
func GetProviderMemoryConfig(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"enabled":                service.ProviderMemoryEnabled(),
		"consolidate_interval_s": common.ProviderMemoryConsolidateInterval,
		"retention_hours":        common.ProviderMemoryRetentionHours,
		"min_facts":              common.ProviderMemoryMinFacts,
	})
}

// UpdateProviderMemoryConfig updates provider memory configuration.
func UpdateProviderMemoryConfig(c *gin.Context) {
	var req struct {
		Enabled                *bool `json:"enabled"`
		ConsolidateIntervalSec *int  `json:"consolidate_interval_sec"`
		RetentionHours         *int  `json:"retention_hours"`
		MinFacts               *int  `json:"min_facts"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	enabled := service.ProviderMemoryEnabled()
	consolidateInterval := common.ProviderMemoryConsolidateInterval
	retentionHours := common.ProviderMemoryRetentionHours
	minFacts := common.ProviderMemoryMinFacts

	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	if req.ConsolidateIntervalSec != nil {
		consolidateInterval = *req.ConsolidateIntervalSec
	}
	if req.RetentionHours != nil {
		retentionHours = *req.RetentionHours
	}
	if req.MinFacts != nil {
		minFacts = *req.MinFacts
	}

	service.ConfigureProviderMemory(enabled, consolidateInterval, retentionHours, int64(minFacts))

	c.JSON(http.StatusOK, gin.H{
		"enabled":                enabled,
		"consolidate_interval_s": consolidateInterval,
		"retention_hours":        retentionHours,
		"min_facts":              minFacts,
		"message":                "Configuration updated. Restart consolidation loop if interval changed.",
	})
}

// ListProviderMemoryFacts returns paginated facts.
func ListProviderMemoryFacts(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "50"))
	channelId, _ := strconv.Atoi(c.Query("channel_id"))
	modelName := c.Query("model_name")
	channelType, _ := strconv.Atoi(c.Query("channel_type"))

	// ProviderRecallFilter has no Offset; we use Limit to bound results.
	// Full pagination support can be added later by extending the filter.
	limit := pageSize
	if limit <= 0 {
		limit = 50
	}

	// Fetch a larger window and slice for pagination (simple approach that
	// works without schema changes to ProviderRecallFilter).
	fetchLimit := page * pageSize
	if fetchLimit <= 0 {
		fetchLimit = pageSize
	}

	filter := service.RecallFilter{
		ChannelId:   channelId,
		ModelName:   modelName,
		ChannelType: channelType,
		Limit:       fetchLimit,
	}

	facts, err := service.RecallProviderFacts(filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Slice for the requested page.
	start := (page - 1) * pageSize
	if start >= len(facts) {
		facts = facts[:0]
	} else {
		end := start + pageSize
		if end > len(facts) {
			end = len(facts)
		}
		facts = facts[start:end]
	}

	c.JSON(http.StatusOK, gin.H{
		"data":  facts,
		"page":  page,
		"size":  pageSize,
		"total": len(facts),
	})
}

// ListProviderMemoryObservations returns paginated observations.
func ListProviderMemoryObservations(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "50"))
	channelId, _ := strconv.Atoi(c.Query("channel_id"))
	modelName := c.Query("model_name")
	channelType, _ := strconv.Atoi(c.Query("channel_type"))

	fetchLimit := page * pageSize
	if fetchLimit <= 0 {
		fetchLimit = pageSize
	}

	filter := service.RecallFilter{
		ChannelId:   channelId,
		ModelName:   modelName,
		ChannelType: channelType,
		Limit:       fetchLimit,
	}

	obs, err := service.RecallProviderObservations(filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	start := (page - 1) * pageSize
	if start >= len(obs) {
		obs = obs[:0]
	} else {
		end := start + pageSize
		if end > len(obs) {
			end = len(obs)
		}
		obs = obs[start:end]
	}

	c.JSON(http.StatusOK, gin.H{
		"data":  obs,
		"page":  page,
		"size":  pageSize,
		"total": len(obs),
	})
}

// ListProviderMentalModels returns all mental models.
func ListProviderMentalModels(c *gin.Context) {
	// Return ALL mental models (not just auto-refresh ones) for the admin UI.
	var mms []model.ProviderMentalModel
	if err := model.DB.Order("created_at DESC").Find(&mms).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": mms})
}

// GetProviderMentalModel returns a specific mental model.
func GetProviderMentalModel(c *gin.Context) {
	sourceQuery := c.Query("source_query")
	scopeModel := c.Query("scope_model")
	if sourceQuery == "" || scopeModel == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "source_query and scope_model required"})
		return
	}

	mm, err := service.GetProviderMentalModel(sourceQuery, scopeModel)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	c.JSON(http.StatusOK, mm)
}

// UpsertProviderMentalModel creates or updates a mental model.
func UpsertProviderMentalModel(c *gin.Context) {
	var req struct {
		SourceQuery string `json:"source_query" binding:"required"`
		ScopeModel  string `json:"scope_model" binding:"required"`
		Content     string `json:"content"`
		Payload     string `json:"payload"`
		Tags        string `json:"tags"`
		AutoRefresh bool   `json:"auto_refresh"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err := service.UpsertProviderMentalModel(req.SourceQuery, req.ScopeModel, req.Content, req.Payload, req.Tags, req.AutoRefresh)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Mental model upserted"})
}

// DeleteProviderMentalModel deletes a mental model.
func DeleteProviderMentalModel(c *gin.Context) {
	sourceQuery := c.Query("source_query")
	scopeModel := c.Query("scope_model")
	if sourceQuery == "" || scopeModel == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "source_query and scope_model required"})
		return
	}

	err := model.DB.Where("source_query = ? AND scope_model = ?", sourceQuery, scopeModel).
		Delete(&model.ProviderMentalModel{}).Error
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Mental model deleted"})
}

// ConsolidateProviderFacts runs manual consolidation.
func ConsolidateProviderFacts(c *gin.Context) {
	n, err := service.ConsolidateProviderFacts()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":            "Consolidation completed",
		"observations_added": n,
	})
}

// PruneOldProviderFacts prunes facts older than given timestamp.
func PruneOldProviderFacts(c *gin.Context) {
	beforeStr := c.Query("before")
	if beforeStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "before timestamp required (unix seconds)"})
		return
	}
	before, err := strconv.ParseInt(beforeStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid before timestamp"})
		return
	}

	pruned, err := service.PruneOldProviderFacts(before)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":      "Pruned old facts",
		"rows_deleted": pruned,
	})
}

// GetRoutingHintByLatency returns best channel by latency for a model.
func GetRoutingHintByLatency(c *gin.Context) {
	modelName := c.Query("model")
	if modelName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "model query param required"})
		return
	}

	hint, err := service.BestChannelByLatency(modelName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if hint == nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "No routing hint available for this model"})
		return
	}

	c.JSON(http.StatusOK, hint)
}

// GetRoutingHintBySuccess returns best channel by success rate for a model.
func GetRoutingHintBySuccess(c *gin.Context) {
	modelName := c.Query("model")
	if modelName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "model query param required"})
		return
	}

	hint, err := service.BestChannelBySuccess(modelName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if hint == nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "No routing hint available for this model"})
		return
	}

	c.JSON(http.StatusOK, hint)
}

// GetProviderMemoryStats returns summary statistics.
func GetProviderMemoryStats(c *gin.Context) {
	var factCount int64
	model.DB.Model(&model.ProviderMemoryFact{}).Count(&factCount)

	var obsCount int64
	model.DB.Model(&model.ProviderObservation{}).Where("superseded_by IS NULL").Count(&obsCount)

	var mmCount int64
	model.DB.Model(&model.ProviderMentalModel{}).Count(&mmCount)

	var scopeCount int64
	model.DB.Model(&model.ProviderMemoryFact{}).
		Select("COUNT(DISTINCT channel_id, model_name)").
		Scan(&scopeCount)

	c.JSON(http.StatusOK, gin.H{
		"facts_total":         factCount,
		"observations_active": obsCount,
		"mental_models_total": mmCount,
		"distinct_scopes":     scopeCount,
		"enabled":             service.ProviderMemoryEnabled(),
	})
}

// GetModelSuitability returns suitability and preference info for a model + source query.
func GetModelSuitability(c *gin.Context) {
	sourceQuery := c.Query("source_query")
	scopeModel := c.Query("scope_model")
	if sourceQuery == "" || scopeModel == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "source_query and scope_model required"})
		return
	}

	suitability, err := service.GetModelSuitability(sourceQuery, scopeModel)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, suitability)
}

// GetBulkModelSuitability returns suitability info for all models for a given source query.
func GetBulkModelSuitability(c *gin.Context) {
	sourceQuery := c.Query("source_query")
	if sourceQuery == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "source_query required"})
		return
	}

	suitability, err := service.GetBulkModelSuitability(sourceQuery)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, suitability)
}