package model

import (
	"sort"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
)

// Provider memory system — an in-process, dependency-free adaptation of the
// Hindsight memory model (retain / recall / reflect / mental models).
//
// Design constraints:
//   - Must work on SQLite, MySQL >= 5.7.8, and PostgreSQL >= 9.6 simultaneously.
//     pgvector is NOT available on SQLite/MySQL, so vector embeddings are NOT
//     stored; semantic search is delegated to the host LLM during Reflect, and
//     Recall uses keyword + entity + temporal matching only (TEMPR-lite).
//   - All JSON marshal/unmarshal goes through common.* per the project rules.
//
// Three memory tiers mirror Hindsight's biomimetic structure:
//  1. World Facts    — raw, time-stamped, per-channel-per-model performance facts
//                      retained after each relay settlement.
//  2. Observations   — consolidated, deduplicated syntheses produced by a
//                      background job that runs Reflect over recent facts.
//  3. Mental Models  — pre-computed, cached answers to a fixed source query
//                      (e.g. "best channel for gpt-4o by latency"), refreshed
//                      after observation consolidation. Reads are instant.

const (
	ProviderMemoryTypeFact        = "fact"
	ProviderMemoryTypeObservation = "observation"
)

// ProviderMemoryFact stores one raw performance observation retained after a
// relay completes. One row per (channel_id, model_name) per retention event.
type ProviderMemoryFact struct {
	Id           int64  `json:"id" gorm:"primaryKey;autoIncrement"`
	ChannelId    int    `json:"channel_id" gorm:"index:idx_pmf_chan_model,priority:1"`
	ModelName    string `json:"model_name" gorm:"type:varchar(128);index:idx_pmf_chan_model,priority:2"`
	ChannelType  int    `json:"channel_type"`
	// Metrics serialized as JSON via common.*. Keys: latency_ms, error_rate,
	// cost_per_1k, success_rate, quota_used, prompt_tokens, completion_tokens.
	Metrics string `json:"metrics" gorm:"type:text"`
	// Entities extracted from context (comma-separated): task tags like
	// "coding","writing","image","audio". Used for entity-graph recall.
	Entities   string `json:"entities" gorm:"type:varchar(512)"`
	// Keywords for BM25-style recall: lowercased significant tokens joined by space.
	Keywords   string `json:"keywords" gorm:"type:text"`
	// Language detected from the request content (ISO 639-1 code: en, zh, ja, ...).
	// Used for multilingual recall — facts are searchable in their original language.
	Language   string `json:"language" gorm:"type:varchar(8)"`
	Success    bool   `json:"success"`
	RetainedAt int64  `json:"retained_at" gorm:"bigint;index"`
	CreatedAt  int64  `json:"created_at" gorm:"bigint"`
}

func (ProviderMemoryFact) TableName() string { return "provider_memory_facts" }

// ProviderObservation is a consolidated, deduplicated synthesis over a window
// of facts for a given (channel_id, model_name). Produced by the background
// consolidation job. One active row per (channel_id, model_name); older rows
// are superseded (superseded_by points to the newer one).
type ProviderObservation struct {
	Id           int64  `json:"id" gorm:"primaryKey;autoIncrement"`
	ChannelId    int    `json:"channel_id" gorm:"index:idx_po_chan_model,priority:1"`
	ModelName    string `json:"model_name" gorm:"type:varchar(128);index:idx_po_chan_model,priority:2"`
	ChannelType  int    `json:"channel_type"`
	// Synthesis text, e.g. "gpt-4o on channel 3: avg latency 1.2s, error rate 0.5%".
	Summary string `json:"summary" gorm:"type:text"`
	// Aggregated metrics snapshot at consolidation time.
	Metrics string `json:"metrics" gorm:"type:text"`
	// Sample size — number of facts consolidated into this observation.
	SampleSize int `json:"sample_size"`
	// Time window covered: [WindowStart, WindowEnd].
	WindowStart int64 `json:"window_start" gorm:"bigint"`
	WindowEnd   int64 `json:"window_end" gorm:"bigint"`
	SupersededBy *int64 `json:"superseded_by" gorm:"index"`
	// Confidence in [0,1], derived from sample size and variance.
	Confidence float64 `json:"confidence"`
	CreatedAt  int64   `json:"created_at" gorm:"bigint;index"`
}

func (ProviderObservation) TableName() string { return "provider_observations" }

// ProviderMentalModel is a pre-computed, cached answer to a fixed source query
// (Hindsight's "mental model"). Refreshed asynchronously after consolidation.
// Reads are a direct DB lookup — no LLM call at read time.
type ProviderMentalModel struct {
	Id           int64  `json:"id" gorm:"primaryKey;autoIncrement"`
	// SourceQuery is the question this model answers, e.g.
	// "best channel by latency for model gpt-4o".
	SourceQuery string `json:"source_query" gorm:"type:varchar(255);uniqueIndex:idx_pmm_scope,priority:1"`
	// Scope narrows the model: model name, channel type, or "global".
	ScopeModel string `json:"scope_model" gorm:"type:varchar(128);uniqueIndex:idx_pmm_scope,priority:2"`
	// Content is the synthesized answer text.
	Content string `json:"content" gorm:"type:text"`
	// Structured payload for machine consumption (ranking tables, etc.).
	Payload string `json:"payload" gorm:"type:text"`
	// Tags for filtering (e.g. "latency","cost","error_rate").
	Tags string `json:"tags" gorm:"type:varchar(255)"`
	// AutoRefresh: when true, the consolidation job refreshes this model after
	// new observations are produced in its scope.
	AutoRefresh bool `json:"auto_refresh"`
	RefreshedAt int64 `json:"refreshed_at" gorm:"bigint"`
	CreatedAt   int64 `json:"created_at" gorm:"bigint"`
}

func (ProviderMentalModel) TableName() string { return "provider_mental_models" }

// --- Retain ---

// RetainProviderFact stores one performance fact after a relay settles.
// channelType, metrics, entities and keywords are normalized by the caller.
func RetainProviderFact(channelId int, modelName string, channelType int,
	metrics string, entities []string, keywords []string, language string, success bool) error {
	if channelId <= 0 || modelName == "" {
		return nil
	}
	now := common.GetTimestamp()
	fact := ProviderMemoryFact{
		ChannelId:   channelId,
		ModelName:   modelName,
		ChannelType: channelType,
		Metrics:     metrics,
		Entities:    strings.Join(entities, ","),
		Keywords:    strings.ToLower(strings.Join(keywords, " ")),
		Language:    language,
		Success:     success,
		RetainedAt:  now,
		CreatedAt:   now,
	}
	return DB.Create(&fact).Error
}

// --- Recall (TEMPR-lite: keyword + entity + temporal) ---

// ProviderRecallFilter narrows a recall query.
type ProviderRecallFilter struct {
	ModelName   string
	ChannelId   int
	ChannelType int
	Entities    []string
	Keywords    []string
	Since       int64 // unix seconds, 0 = no lower bound
	Until       int64 // unix seconds, 0 = now
	Limit       int
}

// RecallProviderFacts returns facts matching the filter, ranked by a simple
// keyword-overlap score (BM25-lite). No vector search — works on all DBs.
func RecallProviderFacts(f ProviderRecallFilter) ([]ProviderMemoryFact, error) {
	if f.Limit <= 0 {
		f.Limit = 20
	}
	if f.Until == 0 {
		f.Until = time.Now().Unix()
	}
	q := DB.Model(&ProviderMemoryFact{})
	if f.ModelName != "" {
		q = q.Where("model_name = ?", f.ModelName)
	}
	if f.ChannelId > 0 {
		q = q.Where("channel_id = ?", f.ChannelId)
	}
	if f.ChannelType > 0 {
		q = q.Where("channel_type = ?", f.ChannelType)
	}
	if f.Since > 0 {
		q = q.Where("retained_at >= ?", f.Since)
	}
	q = q.Where("retained_at <= ?", f.Until)
	// Entity filtering: comma-separated column, LIKE per entity.
	for _, e := range f.Entities {
		e = strings.TrimSpace(e)
		if e != "" {
			q = q.Where("entities LIKE ?", "%,"+e+",%")
		}
	}
	var facts []ProviderMemoryFact
	if err := q.Order("retained_at DESC").Limit(f.Limit * 4).Find(&facts).Error; err != nil {
		return nil, err
	}
	// Keyword overlap scoring (in-memory, post-filter).
	if len(f.Keywords) > 0 {
		want := make(map[string]bool, len(f.Keywords))
		for _, k := range f.Keywords {
			want[strings.ToLower(strings.TrimSpace(k))] = true
		}
		scored := make([]ProviderMemoryFact, 0, len(facts))
		for _, fact := range facts {
			tokens := strings.Fields(fact.Keywords)
			hits := 0
			for _, t := range tokens {
				if want[t] {
					hits++
				}
			}
			if hits > 0 {
				scored = append(scored, fact)
			}
		}
		sort.SliceStable(scored, func(i, j int) bool {
			return scored[i].RetainedAt > scored[j].RetainedAt
		})
		if len(scored) > f.Limit {
			scored = scored[:f.Limit]
		}
		return scored, nil
	}
	if len(facts) > f.Limit {
		facts = facts[:f.Limit]
	}
	return facts, nil
}

// RecallActiveObservations returns the latest non-superseded observation per
// (channel_id, model_name) matching the filter.
func RecallActiveObservations(f ProviderRecallFilter) ([]ProviderObservation, error) {
	if f.Limit <= 0 {
		f.Limit = 20
	}
	q := DB.Model(&ProviderObservation{}).Where("superseded_by IS NULL")
	if f.ModelName != "" {
		q = q.Where("model_name = ?", f.ModelName)
	}
	if f.ChannelId > 0 {
		q = q.Where("channel_id = ?", f.ChannelId)
	}
	if f.ChannelType > 0 {
		q = q.Where("channel_type = ?", f.ChannelType)
	}
	if f.Since > 0 {
		q = q.Where("window_end >= ?", f.Since)
	}
	var obs []ProviderObservation
	if err := q.Order("created_at DESC").Limit(f.Limit).Find(&obs).Error; err != nil {
		return nil, err
	}
	return obs, nil
}

// --- Mental Model reads (instant, no LLM) ---

// GetProviderMentalModel returns the cached mental model for a scope, or nil.
func GetProviderMentalModel(sourceQuery, scopeModel string) (*ProviderMentalModel, error) {
	var mm ProviderMentalModel
	err := DB.Where("source_query = ? AND scope_model = ?", sourceQuery, scopeModel).First(&mm).Error
	if err != nil {
		return nil, err
	}
	return &mm, nil
}

// ListAutoRefreshMentalModels returns models flagged for auto-refresh.
func ListAutoRefreshMentalModels() ([]ProviderMentalModel, error) {
	var mms []ProviderMentalModel
	err := DB.Where("auto_refresh = ?", true).Find(&mms).Error
	return mms, err
}

// UpsertProviderMentalModel creates or replaces a mental model's content.
func UpsertProviderMentalModel(sourceQuery, scopeModel, content, payload, tags string, autoRefresh bool) error {
	now := common.GetTimestamp()
	var existing ProviderMentalModel
	err := DB.Where("source_query = ? AND scope_model = ?", sourceQuery, scopeModel).First(&existing).Error
	if err == nil {
		return DB.Model(&existing).Updates(map[string]any{
			"content":      content,
			"payload":      payload,
			"tags":         tags,
			"auto_refresh": autoRefresh,
			"refreshed_at": now,
		}).Error
	}
	mm := ProviderMentalModel{
		SourceQuery: sourceQuery,
		ScopeModel:  scopeModel,
		Content:     content,
		Payload:     payload,
		Tags:        tags,
		AutoRefresh: autoRefresh,
		RefreshedAt: now,
		CreatedAt:   now,
	}
	return DB.Create(&mm).Error
}

// --- Consolidation helpers (called by the background job) ---

// SupersedeObservation marks an old observation as superseded by a new one.
func SupersedeObservation(oldId, newId int64) error {
	return DB.Model(&ProviderObservation{}).Where("id = ?", oldId).
		Update("superseded_by", newId).Error
}

// CreateProviderObservation inserts a new observation and supersedes prior
// active observations for the same (channel_id, model_name).
func CreateProviderObservation(channelId int, modelName string, channelType int,
	summary, metrics string, sampleSize int, windowStart, windowEnd int64,
	confidence float64) error {
	now := common.GetTimestamp()
	obs := ProviderObservation{
		ChannelId:   channelId,
		ModelName:   modelName,
		ChannelType: channelType,
		Summary:     summary,
		Metrics:     metrics,
		SampleSize:  sampleSize,
		WindowStart: windowStart,
		WindowEnd:   windowEnd,
		Confidence:  confidence,
		CreatedAt:   now,
	}
	if err := DB.Create(&obs).Error; err != nil {
		return err
	}
	// Supersede previous active observations for this scope.
	return DB.Model(&ProviderObservation{}).
		Where("channel_id = ? AND model_name = ? AND id < ? AND superseded_by IS NULL",
			channelId, modelName, obs.Id).
		Update("superseded_by", obs.Id).Error
}

// CountRecentFacts returns the number of facts retained since `since` for a
// (channel_id, model_name) scope. Used by the consolidation job to decide
// whether to re-run.
func CountRecentFacts(channelId int, modelName string, since int64) (int64, error) {
	var n int64
	err := DB.Model(&ProviderMemoryFact{}).
		Where("channel_id = ? AND model_name = ? AND retained_at >= ?", channelId, modelName, since).
		Count(&n).Error
	return n, err
}

// PruneOldFacts deletes facts older than `before` to bound table growth.
func PruneOldFacts(before int64) (int64, error) {
	res := DB.Where("retained_at < ?", before).Delete(&ProviderMemoryFact{})
	return res.RowsAffected, res.Error
}
