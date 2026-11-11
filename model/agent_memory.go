package model

import (
	"encoding/json"
	"strings"
	"time"

	"gorm.io/gorm"

	"github.com/QuantumNous/new-api/common"
)

// Agent Memory system — a Hindsight-inspired long-term memory for AI agents,
// integrated into new-api. Provides retain / recall / reflect over
// per-bank (user/agent-scoped) memory with observation consolidation and
// mental models.
//
// Design constraints:
//   - Must work on SQLite, MySQL >= 5.7.8, and PostgreSQL >= 9.6
//     simultaneously. pgvector is NOT assumed, so semantic search is
//     delegated to the host LLM during Reflect; Recall uses keyword +
//     entity + temporal matching (TEMPR-lite).
//   - All JSON marshal/unmarshal goes through common.* per project rules.
//   - Banks are isolated by UserId / AgentId so different agents/users
//     cannot read each other's memory.

const (
	// MemoryTypeFact is a raw, time-stamped fact extracted from a conversation.
	MemoryTypeFact = "fact"
	// MemoryTypeObservation is a consolidated, deduplicated synthesis over a
	// window of facts.
	MemoryTypeObservation = "observation"
)

// MemoryBank is an isolated memory store. All facts, observations, mental
// models and knowledge pages belong to exactly one bank.
// Hindsight-compatible configuration fields allow tuning extraction and recall behavior.
type MemoryBank struct {
	Id          int64  `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId    int    `json:"user_id" gorm:"index:idx_mb_user_agent,priority:1"`
	AgentId   string `json:"agent_id" gorm:"type:varchar(128);index:idx_mb_user_agent,priority:2"`
	Name      string `json:"name" gorm:"type:varchar(255)"`
	Description string `json:"description" gorm:"type:text"`

	// Hindsight-compatible configuration
	DispositionSkepticism int    `json:"disposition_skepticism" gorm:"default:3"`        // 1-5
	DispositionLiteralism int    `json:"disposition_literalism" gorm:"default:3"`        // 1-5
	DispositionEmpathy    int    `json:"disposition_empathy" gorm:"default:3"`            // 1-5
	Mission               string `json:"mission" gorm:"type:text"`                        // high-level purpose
	Background            string `json:"background" gorm:"type:text"`                     // persistent context
	ReflectMission        string `json:"reflect_mission" gorm:"type:text"`                // how to synthesize
	RetainMission         string `json:"retain_mission" gorm:"type:text"`                 // how to extract
	RetainExtractionMode  string `json:"retain_extraction_mode" gorm:"type:varchar(32);default:'both'"` // facts|observations|both
	RetainChunkSize       int    `json:"retain_chunk_size" gorm:"default:4000"`           // chunking for long content
	RetainCustomInstructions string `json:"retain_custom_instructions" gorm:"type:text"`   // custom extraction rules
	EnableObservations    bool   `json:"enable_observations" gorm:"default:true"`
	EnableTextSearch      bool   `json:"enable_text_search" gorm:"default:true"`
	EnableTemporalRetrieval bool `json:"enable_temporal_retrieval" gorm:"default:true"`
	EnableGraphRetrieval  bool   `json:"enable_graph_retrieval" gorm:"default:true"`
	EnableReranking       bool   `json:"enable_reranking" gorm:"default:false"`

	CreatedAt int64  `json:"created_at" gorm:"bigint;index"`
	UpdatedAt int64  `json:"updated_at" gorm:"bigint"`
}

func (MemoryBank) TableName() string { return "memory_banks" }

// MemoryFact is one raw fact extracted from a conversation turn.
type MemoryFact struct {
	Id          int64  `json:"id" gorm:"primaryKey;autoIncrement"`
	BankId    int64  `json:"bank_id" gorm:"index:idx_mf_bank,priority:1"`
	Content   string `json:"content" gorm:"type:text"`
	// Comma-separated entity tags (e.g. "coding,writing,python").
	Entities string `json:"entities" gorm:"type:varchar(512)"`
	// Space-separated lowercased keywords for BM25-lite recall.
	Keywords string `json:"keywords" gorm:"type:text"`
	// ISO 639-1 language code (en, zh, ja, ...).
	Language   string `json:"language" gorm:"type:varchar(8)"`
	Confidence float64 `json:"confidence" gorm:"default:1.0"`
	RetainedAt int64  `json:"retained_at" gorm:"bigint;index"`
	CreatedAt  int64  `json:"created_at" gorm:"bigint"`

	// Hindsight-compatible fields
	DocumentId  string `json:"document_id" gorm:"type:varchar(128);index"`
	Context     string `json:"context" gorm:"type:varchar(256)"`
	Tags        string `json:"tags" gorm:"type:varchar(512)"` // comma-separated
	SourceRole  string `json:"source_role" gorm:"type:varchar(32)"` // user|assistant|system
	ChunkIndex  int    `json:"chunk_index" gorm:"default:0"`
	ChunkTotal  int    `json:"chunk_total" gorm:"default:1"`
}

func (MemoryFact) TableName() string { return "memory_facts" }

// MemoryObservation is a consolidated synthesis over a window of facts for a
// bank. Older rows are superseded by newer ones (superseded_by chain).
type MemoryObservation struct {
	Id           int64   `json:"id" gorm:"primaryKey;autoIncrement"`
	BankId     int64   `json:"bank_id" gorm:"index:idx_mo_bank,priority:1"`
	Summary    string  `json:"summary" gorm:"type:text"`
	Entities   string  `json:"entities" gorm:"type:varchar(512)"`
	Keywords   string  `json:"keywords" gorm:"type:text"`
	Confidence float64 `json:"confidence"`
	SampleSize int     `json:"sample_size"`
	WindowStart int64  `json:"window_start" gorm:"bigint"`
	WindowEnd   int64  `json:"window_end" gorm:"bigint"`
	SupersededBy *int64 `json:"superseded_by" gorm:"index"`
	CreatedAt  int64  `json:"created_at" gorm:"bigint;index"`

	// Hindsight-compatible fields
	Strategy     string `json:"strategy" gorm:"type:varchar(64)"` // entity_temporal|topic_clustering
	ScopeTags    string `json:"scope_tags" gorm:"type:varchar(512)"`
	FactIds      string `json:"fact_ids" gorm:"type:text"` // comma-separated fact IDs
}

func (MemoryObservation) TableName() string { return "memory_observations" }

// MemoryMentalModel is a pre-computed, cached answer to a fixed source query
// (Hindsight's "mental model"). Reads are a direct DB lookup — no LLM call.
type MemoryMentalModel struct {
	Id           int64  `json:"id" gorm:"primaryKey;autoIncrement"`
	BankId     int64  `json:"bank_id" gorm:"index:idx_mm_bank,priority:1"`
	// SourceQuery is the question this model answers, e.g.
	// "user's preferred coding language".
	SourceQuery string `json:"source_query" gorm:"type:varchar(255);uniqueIndex:idx_mm_scope,priority:2"`
	ScopeModel  string `json:"scope_model" gorm:"type:varchar(128);uniqueIndex:idx_mm_scope,priority:1"`
	Content     string `json:"content" gorm:"type:text"`
	Payload     string `json:"payload" gorm:"type:text"`
	Tags        string `json:"tags" gorm:"type:varchar(255)"`
	AutoRefresh bool   `json:"auto_refresh"`
	RefreshedAt int64  `json:"refreshed_at" gorm:"bigint"`
	CreatedAt   int64  `json:"created_at" gorm:"bigint"`

	// Hindsight-compatible fields
	MaxTokens           int    `json:"max_tokens" gorm:"default:2048"`
	TriggerType         string `json:"trigger_type" gorm:"type:varchar(32)"` // scheduled|on_recall|on_retain|manual
	TriggerCron         string `json:"trigger_cron" gorm:"type:varchar(64)"`
	TriggerRecallTags   string `json:"trigger_recall_tags" gorm:"type:varchar(512)"`
	TriggerRetainTags   string `json:"trigger_retain_tags" gorm:"type:varchar(512)"`
	LastRefreshedAt     int64  `json:"last_refreshed_at" gorm:"bigint"`
	RefreshStatus       string `json:"refresh_status" gorm:"type:varchar(32)"` // pending|success|failed
	RefreshError        string `json:"refresh_error" gorm:"type:text"`
	ResponseSchema      string `json:"response_schema" gorm:"type:text"` // JSON Schema for structured output
}

func (MemoryMentalModel) TableName() string { return "memory_mental_models" }

// KnowledgePage is a living document the bank writes about itself —
// "What are the components here?", "What's our error-handling convention?" —
// rewritten incrementally as consolidation produces new knowledge.
type KnowledgePage struct {
	Id        int64  `json:"id" gorm:"primaryKey;autoIncrement"`
	BankId  int64  `json:"bank_id" gorm:"index:idx_kp_bank,priority:1"`
	Title   string `json:"title" gorm:"type:varchar(255)"`
	Content string `json:"content" gorm:"type:text"`
	// Hierarchical path, e.g. "architecture/errors". Browsable tree.
	Path    string `json:"path" gorm:"type:varchar(512)"`
	ParentId *int64 `json:"parent_id" gorm:"index"`
	UpdatedAt int64 `json:"updated_at" gorm:"bigint;index"`
	CreatedAt int64 `json:"created_at" gorm:"bigint"`

	// Hindsight-compatible fields
	SourceQuery string `json:"source_query" gorm:"type:varchar(255)"`
	Tags        string `json:"tags" gorm:"type:varchar(512)"`
	MaxTokens   int    `json:"max_tokens" gorm:"default:2048"`
	TriggerType string `json:"trigger_type" gorm:"type:varchar(32)"` // scheduled|on_recall|on_retain|manual
	TriggerCron string `json:"trigger_cron" gorm:"type:varchar(64)"`
}

func (KnowledgePage) TableName() string { return "knowledge_pages" }

// --- New Hindsight-compatible types ---

// MemoryEntityRelation represents an entity relationship for graph retrieval.
type MemoryEntityRelation struct {
	Id           int64  `json:"id" gorm:"primaryKey;autoIncrement"`
	BankId     int64  `json:"bank_id" gorm:"index:idx_mer_bank,priority:1"`
	SourceEntity string `json:"source_entity" gorm:"type:varchar(255);index:idx_mer_source"`
	TargetEntity string `json:"target_entity" gorm:"type:varchar(255);index:idx_mer_target"`
	RelationType string `json:"relation_type" gorm:"type:varchar(64);default:'cooccurs'"`
	Weight       float64 `json:"weight" gorm:"default:1.0"`
	CreatedAt    int64  `json:"created_at" gorm:"bigint"`
}

func (MemoryEntityRelation) TableName() string { return "memory_entity_relations" }

// MemoryDocument tracks documents for idempotent retain with upsert.
type MemoryDocument struct {
	Id           int64  `json:"id" gorm:"primaryKey;autoIncrement"`
	BankId     int64  `json:"bank_id" gorm:"index:idx_md_bank,priority:1"`
	DocumentId string `json:"document_id" gorm:"type:varchar(128);uniqueIndex:idx_md_bank_doc,priority:2"`
	ContentHash  string `json:"content_hash" gorm:"type:varchar(64)"`
	ChunkCount   int    `json:"chunk_count" gorm:"default:0"`
	UpdatedAt    int64  `json:"updated_at" gorm:"bigint"`
	CreatedAt    int64  `json:"created_at" gorm:"bigint"`
}

func (MemoryDocument) TableName() string { return "memory_documents" }

// MemoryChunk stores raw source chunks for retrieval with attachments.
type MemoryChunk struct {
	Id          int64  `json:"id" gorm:"primaryKey;autoIncrement"`
	FactId    int64  `json:"fact_id" gorm:"index:idx_mc_fact"`
	ChunkIndex  int    `json:"chunk_index"`
	Text        string `json:"text" gorm:"type:text"`
	Attachments string `json:"attachments" gorm:"type:text"` // JSON array of ContentBlock
	CreatedAt   int64  `json:"created_at" gorm:"bigint"`
}

func (MemoryChunk) TableName() string { return "memory_chunks" }

// MemoryEntity stores canonical entities for resolution.
type MemoryEntity struct {
	Id             int64  `json:"id" gorm:"primaryKey;autoIncrement"`
	BankId       int64  `json:"bank_id" gorm:"index:idx_me_bank,priority:1"`
	CanonicalName  string `json:"canonical_name" gorm:"type:varchar(255);uniqueIndex:idx_me_bank_name,priority:2"`
	Type           string `json:"type" gorm:"type:varchar(64);default:'CONCEPT'"`
	Aliases        string `json:"aliases" gorm:"type:text"` // JSON array of strings
	Description    string `json:"description" gorm:"type:text"`
	Metadata       string `json:"metadata" gorm:"type:text"` // JSON object
	CreatedAt      int64  `json:"created_at" gorm:"bigint"`
	UpdatedAt      int64  `json:"updated_at" gorm:"bigint"`
}

func (MemoryEntity) TableName() string { return "memory_entities" }

// DecisionModel configures a decision model for reranking/pruning/dedup.
type DecisionModel struct {
	Id        int64  `json:"id" gorm:"primaryKey;autoIncrement"`
	BankId    int64  `json:"bank_id" gorm:"index:idx_dm_bank,priority:1"`
	ModelType   string `json:"model_type" gorm:"type:varchar(64);uniqueIndex:idx_dm_bank_type,priority:2"` // recall_rerank|recall_prune|recall_dedup|reflect_judge
	Endpoint    string `json:"endpoint" gorm:"type:varchar(512)"`
	ApiKey      string `json:"api_key" gorm:"type:varchar(256)"`
	Config      string `json:"config" gorm:"type:text"` // JSON object
	Enabled     bool   `json:"enabled" gorm:"default:true"`
	CreatedAt   int64  `json:"created_at" gorm:"bigint"`
	UpdatedAt   int64  `json:"updated_at" gorm:"bigint"`
}

func (DecisionModel) TableName() string { return "decision_models" }

// MemoryOperation tracks async operations.
type MemoryOperation struct {
	Id            int64  `json:"id" gorm:"primaryKey;autoIncrement"`
	BankId      int64  `json:"bank_id" gorm:"index:idx_mo_bank,priority:1"`
	OperationType string `json:"operation_type" gorm:"type:varchar(64)"` // retain|reflect|consolidate|refresh
	Status        string `json:"status" gorm:"type:varchar(32)"` // pending|running|completed|failed
	Input         string `json:"input" gorm:"type:text"` // JSON
	Output        string `json:"output" gorm:"type:text"` // JSON
	Error         string `json:"error" gorm:"type:text"`
	StartedAt     int64  `json:"started_at" gorm:"bigint"`
	CompletedAt   int64  `json:"completed_at" gorm:"bigint"`
	CreatedAt     int64  `json:"created_at" gorm:"bigint"`
}

func (MemoryOperation) TableName() string { return "memory_operations" }

// MemoryWebhook configures webhook notifications.
type MemoryWebhook struct {
	Id        int64  `json:"id" gorm:"primaryKey;autoIncrement"`
	BankId    int64  `json:"bank_id" gorm:"index:idx_mw_bank"`
	Url         string `json:"url" gorm:"type:varchar(512)"`
	Events      string `json:"events" gorm:"type:text"` // JSON array of event types
	Secret      string `json:"secret" gorm:"type:varchar(256)"`
	Enabled     bool   `json:"enabled" gorm:"default:true"`
	CreatedAt   int64  `json:"created_at" gorm:"bigint"`
}

func (MemoryWebhook) TableName() string { return "memory_webhooks" }

// MemoryBankTemplate stores pre-configured bank templates.
type MemoryBankTemplate struct {
	Id          int64  `json:"id" gorm:"primaryKey;autoIncrement"`
	Name        string `json:"name" gorm:"type:varchar(128)"`
	Description string `json:"description" gorm:"type:text"`
	Config      string `json:"config" gorm:"type:text"` // JSON object with full bank config
	IsPublic    bool   `json:"is_public" gorm:"default:false"`
	CreatedAt   int64  `json:"created_at" gorm:"bigint"`
	UpdatedAt   int64  `json:"updated_at" gorm:"bigint"`
}

func (MemoryBankTemplate) TableName() string { return "memory_bank_templates" }

// --- Retain ---

// MemoryFactInput carries the normalized input for retaining a fact.
type MemoryFactInput struct {
	BankId    int64
	Content   string
	Entities  []string
	Keywords  []string
	Language  string
	Confidence float64
}

// RetainMemoryFact stores one fact in a memory bank.
func RetainMemoryFact(in MemoryFactInput) error {
	if in.BankId <= 0 || in.Content == "" {
		return nil
	}
	now := common.GetTimestamp()
	fact := MemoryFact{
		BankId:     in.BankId,
		Content:    in.Content,
		Entities:   strings.Join(in.Entities, ","),
		Keywords:   strings.ToLower(strings.Join(in.Keywords, " ")),
		Language:   in.Language,
		Confidence: in.Confidence,
		RetainedAt: now,
		CreatedAt:  now,
	}
	if fact.Confidence == 0 {
		fact.Confidence = 1.0
	}
	return DB.Create(&fact).Error
}

// --- Recall (TEMPR-lite: keyword + entity + temporal) ---

// MemoryRecallFilter narrows a recall query over a memory bank.
type MemoryRecallFilter struct {
	BankId    int64
	Entities  []string
	Keywords  []string
	Language  string
	Since     int64 // unix seconds, 0 = no lower bound
	Until     int64 // unix seconds, 0 = now
	Limit     int
	Offset    int
}

// RecallMemoryFacts returns facts matching the filter, ranked by keyword
// overlap score (BM25-lite). Works on all supported databases.
func RecallMemoryFacts(f MemoryRecallFilter) ([]MemoryFact, error) {
	if f.Limit <= 0 {
		f.Limit = 20
	}
	if f.Offset < 0 {
		f.Offset = 0
	}
	if f.Until == 0 {
		f.Until = time.Now().Unix()
	}
	q := DB.Model(&MemoryFact{}).Where("bank_id = ?", f.BankId)
	if f.Language != "" {
		q = q.Where("language = ?", f.Language)
	}
	if f.Since > 0 {
		q = q.Where("retained_at >= ?", f.Since)
	}
	q = q.Where("retained_at <= ?", f.Until)
	for _, e := range f.Entities {
		e = strings.TrimSpace(e)
		if e != "" {
			q = q.Where("entities LIKE ?", "%,"+e+",%")
		}
	}
	var facts []MemoryFact
	if err := q.Order("retained_at DESC").Limit(f.Limit * 4).Offset(f.Offset).Find(&facts).Error; err != nil {
		return nil, err
	}
	if len(f.Keywords) > 0 {
		want := make(map[string]bool, len(f.Keywords))
		for _, k := range f.Keywords {
			want[strings.ToLower(strings.TrimSpace(k))] = true
		}
		scored := make([]MemoryFact, 0, len(facts))
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
		if len(scored) > 0 {
			sortMemoryFactsByRetainedAt(scored)
			if len(scored) > f.Limit {
				scored = scored[:f.Limit]
			}
			return scored, nil
		}
	}
	if len(facts) > f.Limit {
		facts = facts[:f.Limit]
	}
	return facts, nil
}

// RecallBankActiveObservations returns the latest non-superseded observations
// for a bank matching the filter.
func RecallBankActiveObservations(f MemoryRecallFilter) ([]MemoryObservation, error) {
	if f.Limit <= 0 {
		f.Limit = 20
	}
	if f.Offset < 0 {
		f.Offset = 0
	}
	q := DB.Model(&MemoryObservation{}).Where("bank_id = ? AND superseded_by IS NULL", f.BankId)
	if f.Since > 0 {
		q = q.Where("window_end >= ?", f.Since)
	}
	var obs []MemoryObservation
	if err := q.Order("created_at DESC").Limit(f.Limit).Offset(f.Offset).Find(&obs).Error; err != nil {
		return nil, err
	}
	return obs, nil
}

func sortMemoryFactsByRetainedAt(facts []MemoryFact) {
	for i := 0; i < len(facts); i++ {
		for j := i + 1; j < len(facts); j++ {
			if facts[j].RetainedAt > facts[i].RetainedAt {
				facts[i], facts[j] = facts[j], facts[i]
			}
		}
	}
}

// --- Mental Model reads ---

// GetMemoryMentalModel returns the cached mental model for a bank+scope, or nil.
func GetMemoryMentalModel(bankId int64, sourceQuery, scopeModel string) (*MemoryMentalModel, error) {
	var mm MemoryMentalModel
	err := DB.Where("bank_id = ? AND source_query = ? AND scope_model = ?", bankId, sourceQuery, scopeModel).First(&mm).Error
	if err != nil {
		return nil, err
	}
	return &mm, nil
}

// ListMemoryMentalModels returns mental models for a bank, optionally filtered by tags.
func ListMemoryMentalModels(bankId int64, tags []string) ([]MemoryMentalModel, error) {
	var mms []MemoryMentalModel
	q := DB.Where("bank_id = ?", bankId)
	for _, t := range tags {
		t = strings.TrimSpace(t)
		if t != "" {
			q = q.Where("tags LIKE ?", "%"+t+"%")
		}
	}
	err := q.Order("created_at DESC").Find(&mms).Error
	return mms, err
}

// UpsertMemoryMentalModel creates or replaces a mental model's content.
func UpsertMemoryMentalModel(bankId int64, sourceQuery, scopeModel, content, payload, tags string, autoRefresh bool) error {
	now := common.GetTimestamp()
	var existing MemoryMentalModel
	err := DB.Where("bank_id = ? AND source_query = ? AND scope_model = ?", bankId, sourceQuery, scopeModel).First(&existing).Error
	if err == nil {
		return DB.Model(&existing).Updates(map[string]any{
			"content":         content,
			"payload":         payload,
			"tags":            tags,
			"auto_refresh":    autoRefresh,
			"refreshed_at":    now,
			"max_tokens":      2048,
			"trigger_type":    "",
			"trigger_cron":    "",
			"trigger_recall_tags": "",
			"trigger_retain_tags": "",
			"last_refreshed_at": 0,
			"refresh_status":  "",
			"refresh_error":   "",
			"response_schema": "",
		}).Error
	}
	mm := MemoryMentalModel{
		BankId:      bankId,
		SourceQuery: sourceQuery,
		ScopeModel:  scopeModel,
		Content:     content,
		Payload:     payload,
		Tags:        tags,
		AutoRefresh: autoRefresh,
		RefreshedAt: now,
		CreatedAt:   now,
		MaxTokens:   2048,
	}
	return DB.Create(&mm).Error
}

// --- Consolidation helpers ---

// SupersedeBankObservation marks an old observation as superseded by a new one.
func SupersedeBankObservation(oldId, newId int64) error {
	return DB.Model(&MemoryObservation{}).Where("id = ?", oldId).
		Update("superseded_by", newId).Error
}

// CreateMemoryObservation inserts a new observation and supersedes prior
// active observations for the same bank.
func CreateMemoryObservation(bankId int64, summary, entities, keywords string,
	sampleSize int, windowStart, windowEnd int64, confidence float64) error {
	return CreateMemoryObservationWithDetails(bankId, summary, entities, keywords,
		sampleSize, windowStart, windowEnd, confidence, "", "", "")
}

// CreateMemoryObservationWithDetails inserts a new observation with full details
// and supersedes prior active observations for the same bank.
func CreateMemoryObservationWithDetails(bankId int64, summary, entities, keywords string,
	sampleSize int, windowStart, windowEnd int64, confidence float64,
	strategy, scopeTags, factIds string) error {
	now := common.GetTimestamp()
	obs := MemoryObservation{
		BankId:      bankId,
		Summary:     summary,
		Entities:    entities,
		Keywords:    keywords,
		Confidence:  confidence,
		SampleSize:  sampleSize,
		WindowStart: windowStart,
		WindowEnd:   windowEnd,
		CreatedAt:   now,
		Strategy:    strategy,
		ScopeTags:   scopeTags,
		FactIds:     factIds,
	}
	if err := DB.Create(&obs).Error; err != nil {
		return err
	}
	return DB.Model(&MemoryObservation{}).
		Where("bank_id = ? AND id < ? AND superseded_by IS NULL", bankId, obs.Id).
		Update("superseded_by", obs.Id).Error
}

// CountBankRecentFacts returns the number of facts retained since `since` for a bank.
func CountBankRecentFacts(bankId int64, since int64) (int64, error) {
	var n int64
	err := DB.Model(&MemoryFact{}).
		Where("bank_id = ? AND retained_at >= ?", bankId, since).
		Count(&n).Error
	return n, err
}

// PruneBankOldFacts deletes facts older than `before` to bound table growth.
func PruneBankOldFacts(before int64) (int64, error) {
	res := DB.Where("retained_at < ?", before).Delete(&MemoryFact{})
	return res.RowsAffected, res.Error
}

// --- Knowledge Pages ---

// CreateKnowledgePage inserts a new knowledge page.
func CreateKnowledgePage(bankId int64, title, content, path string, parentId *int64) (*KnowledgePage, error) {
	now := common.GetTimestamp()
	page := KnowledgePage{
		BankId:     bankId,
		Title:      title,
		Content:    content,
		Path:       path,
		ParentId:   parentId,
		UpdatedAt:  now,
		CreatedAt:  now,
	}
	if err := DB.Create(&page).Error; err != nil {
		return nil, err
	}
	return &page, nil
}

// GetKnowledgePage returns a knowledge page by ID.
func GetKnowledgePage(id int64) (*KnowledgePage, error) {
	var page KnowledgePage
	err := DB.First(&page, id).Error
	if err != nil {
		return nil, err
	}
	return &page, nil
}

// ListKnowledgePages returns knowledge pages for a bank, optionally filtered by path prefix.
func ListKnowledgePages(bankId int64, pathPrefix string) ([]KnowledgePage, error) {
	var pages []KnowledgePage
	q := DB.Where("bank_id = ?", bankId)
	if pathPrefix != "" {
		q = q.Where("path LIKE ?", pathPrefix+"%")
	}
	err := q.Order("path ASC, created_at ASC").Find(&pages).Error
	return pages, err
}

// UpdateKnowledgePage updates a knowledge page's content.
func UpdateKnowledgePage(id int64, title, content, path string) error {
	now := common.GetTimestamp()
	return DB.Model(&KnowledgePage{}).Where("id = ?", id).
		Updates(map[string]any{
			"title":       title,
			"content":     content,
			"path":        path,
			"updated_at":  now,
		}).Error
}

// DeleteKnowledgePage deletes a knowledge page by ID.
func DeleteKnowledgePage(id int64) error {
	return DB.Delete(&KnowledgePage{}, id).Error
}

// --- Bank CRUD ---

// CreateMemoryBank inserts a new memory bank.
func CreateMemoryBank(bank *MemoryBank) error {
	now := common.GetTimestamp()
	if bank.CreatedAt == 0 {
		bank.CreatedAt = now
	}
	if bank.UpdatedAt == 0 {
		bank.UpdatedAt = now
	}
	return DB.Create(bank).Error
}

// GetMemoryBank returns a memory bank by ID.
func GetMemoryBank(id int64) (*MemoryBank, error) {
	var bank MemoryBank
	err := DB.First(&bank, id).Error
	if err != nil {
		return nil, err
	}
	return &bank, nil
}

// ListMemoryBanks returns memory banks for a user, optionally filtered by agent.
func ListMemoryBanks(userId int, agentId string) ([]MemoryBank, error) {
	var banks []MemoryBank
	q := DB.Where("user_id = ?", userId)
	if agentId != "" {
		q = q.Where("agent_id = ?", agentId)
	}
	err := q.Order("updated_at DESC").Find(&banks).Error
	return banks, err
}

// UpdateMemoryBank updates a memory bank's name/description.
func UpdateMemoryBank(id int64, name, description string) error {
	now := common.GetTimestamp()
	return DB.Model(&MemoryBank{}).Where("id = ?", id).
		Updates(map[string]any{
			"name":        name,
			"description": description,
			"updated_at":  now,
		}).Error
}

// DeleteMemoryBank deletes a memory bank and all its facts, observations,
// mental models and knowledge pages.
func DeleteMemoryBank(id int64) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("bank_id = ?", id).Delete(&MemoryFact{}).Error; err != nil {
			return err
		}
		if err := tx.Where("bank_id = ?", id).Delete(&MemoryObservation{}).Error; err != nil {
			return err
		}
		if err := tx.Where("bank_id = ?", id).Delete(&MemoryMentalModel{}).Error; err != nil {
			return err
		}
		if err := tx.Where("bank_id = ?", id).Delete(&KnowledgePage{}).Error; err != nil {
			return err
		}
		if err := tx.Where("bank_id = ?", id).Delete(&MemoryEntityRelation{}).Error; err != nil {
			return err
		}
		if err := tx.Where("bank_id = ?", id).Delete(&MemoryDocument{}).Error; err != nil {
			return err
		}
		if err := tx.Where("bank_id = ?", id).Delete(&MemoryChunk{}).Error; err != nil {
			return err
		}
		if err := tx.Where("bank_id = ?", id).Delete(&MemoryEntity{}).Error; err != nil {
			return err
		}
		if err := tx.Where("bank_id = ?", id).Delete(&DecisionModel{}).Error; err != nil {
			return err
		}
		if err := tx.Where("bank_id = ?", id).Delete(&MemoryOperation{}).Error; err != nil {
			return err
		}
		if err := tx.Where("bank_id = ?", id).Delete(&MemoryWebhook{}).Error; err != nil {
			return err
		}
		return tx.Delete(&MemoryBank{}, id).Error
	})
}

// --- Entity Relations (Graph Retrieval) ---

// UpsertEntityRelation creates or updates an entity relation.
func UpsertEntityRelation(bankId int64, sourceEntity, targetEntity, relationType string, weight float64) error {
	if weight == 0 {
		weight = 1.0
	}
	now := common.GetTimestamp()
	var existing MemoryEntityRelation
	err := DB.Where("bank_id = ? AND source_entity = ? AND target_entity = ? AND relation_type = ?",
		bankId, sourceEntity, targetEntity, relationType).First(&existing).Error
	if err == nil {
		return DB.Model(&existing).Updates(map[string]any{
			"weight":      weight,
			"updated_at":  now,
		}).Error
	}
	rel := MemoryEntityRelation{
		BankId:       bankId,
		SourceEntity: sourceEntity,
		TargetEntity: targetEntity,
		RelationType: relationType,
		Weight:       weight,
		CreatedAt:    now,
	}
	return DB.Create(&rel).Error
}

// GetEntityRelations returns all relations for a bank.
func GetEntityRelations(bankId int64) ([]MemoryEntityRelation, error) {
	var rels []MemoryEntityRelation
	err := DB.Where("bank_id = ?", bankId).Find(&rels).Error
	return rels, err
}

// GetEntityNeighbors returns entities connected to the given entity.
func GetEntityNeighbors(bankId int64, entity string, maxDepth int) ([]string, error) {
	if maxDepth <= 0 {
		maxDepth = 2
	}
	visited := make(map[string]bool)
	queue := []string{entity}
	visited[entity] = true
	var neighbors []string

	for depth := 0; depth < maxDepth && len(queue) > 0; depth++ {
		nextQueue := []string{}
		for _, e := range queue {
			var rels []MemoryEntityRelation
			err := DB.Where("bank_id = ? AND (source_entity = ? OR target_entity = ?)", bankId, e, e).Find(&rels).Error
			if err != nil {
				continue
			}
			for _, r := range rels {
				neighbor := r.TargetEntity
				if r.SourceEntity == e {
					neighbor = r.TargetEntity
				} else {
					neighbor = r.SourceEntity
				}
				if !visited[neighbor] {
					visited[neighbor] = true
					neighbors = append(neighbors, neighbor)
					nextQueue = append(nextQueue, neighbor)
				}
			}
		}
		queue = nextQueue
	}
	return neighbors, nil
}

// --- Documents (Idempotent Retain) ---

// GetDocumentByDocId returns a document by its document_id.
func GetDocumentByDocId(bankId int64, documentId string) (*MemoryDocument, error) {
	var doc MemoryDocument
	err := DB.Where("bank_id = ? AND document_id = ?", bankId, documentId).First(&doc).Error
	if err != nil {
		return nil, err
	}
	return &doc, nil
}

// UpsertDocument creates or updates a document record.
func UpsertDocument(bankId int64, documentId, contentHash string, chunkCount int) error {
	now := common.GetTimestamp()
	var existing MemoryDocument
	err := DB.Where("bank_id = ? AND document_id = ?", bankId, documentId).First(&existing).Error
	if err == nil {
		return DB.Model(&existing).Updates(map[string]any{
			"content_hash": contentHash,
			"chunk_count":  chunkCount,
			"updated_at":   now,
		}).Error
	}
	doc := MemoryDocument{
		BankId:      bankId,
		DocumentId:  documentId,
		ContentHash: contentHash,
		ChunkCount:  chunkCount,
		UpdatedAt:   now,
		CreatedAt:   now,
	}
	return DB.Create(&doc).Error
}

// DeleteDocument removes a document and its associated facts/chunks.
func DeleteDocument(bankId int64, documentId string) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("bank_id = ? AND document_id = ?", bankId, documentId).Delete(&MemoryFact{}).Error; err != nil {
			return err
		}
		if err := tx.Where("bank_id = ? AND document_id = ?", bankId, documentId).Delete(&MemoryChunk{}).Error; err != nil {
			return err
		}
		return tx.Where("bank_id = ? AND document_id = ?", bankId, documentId).Delete(&MemoryDocument{}).Error
	})
}

// --- Chunks ---

// CreateChunks inserts chunks for a fact.
func CreateChunks(factId int64, chunks []MemoryChunk) error {
	if len(chunks) == 0 {
		return nil
	}
	return DB.Create(&chunks).Error
}

// GetChunksByFactId returns chunks for a fact.
func GetChunksByFactId(factId int64) ([]MemoryChunk, error) {
	var chunks []MemoryChunk
	err := DB.Where("fact_id = ?", factId).Order("chunk_index ASC").Find(&chunks).Error
	return chunks, err
}

// GetChunksByDocumentId returns chunks for a document.
func GetChunksByDocumentId(bankId int64, documentId string) ([]MemoryChunk, error) {
	var factIds []int64
	err := DB.Model(&MemoryFact{}).Where("bank_id = ? AND document_id = ?", bankId, documentId).Pluck("id", &factIds).Error
	if err != nil || len(factIds) == 0 {
		return nil, err
	}
	var chunks []MemoryChunk
	err = DB.Where("fact_id IN ?", factIds).Order("fact_id ASC, chunk_index ASC").Find(&chunks).Error
	return chunks, err
}

// --- Entities ---

// UpsertEntity creates or updates a canonical entity.
func UpsertEntity(bankId int64, canonicalName, entityType string, aliases []string, description string, metadata map[string]string) error {
	now := common.GetTimestamp()
	aliasesJSON, _ := json.Marshal(aliases)
	metadataJSON, _ := json.Marshal(metadata)
	var existing MemoryEntity
	err := DB.Where("bank_id = ? AND canonical_name = ?", bankId, canonicalName).First(&existing).Error
	if err == nil {
		return DB.Model(&existing).Updates(map[string]any{
			"type":         entityType,
			"aliases":      string(aliasesJSON),
			"description":  description,
			"metadata":     string(metadataJSON),
			"updated_at":   now,
		}).Error
	}
	ent := MemoryEntity{
		BankId:        bankId,
		CanonicalName: canonicalName,
		Type:          entityType,
		Aliases:       string(aliasesJSON),
		Description:   description,
		Metadata:      string(metadataJSON),
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	return DB.Create(&ent).Error
}

// GetEntity returns an entity by canonical name.
func GetEntity(bankId int64, canonicalName string) (*MemoryEntity, error) {
	var ent MemoryEntity
	err := DB.Where("bank_id = ? AND canonical_name = ?", bankId, canonicalName).First(&ent).Error
	if err != nil {
		return nil, err
	}
	return &ent, nil
}

// ListEntities returns all entities for a bank.
func ListEntities(bankId int64) ([]MemoryEntity, error) {
	var ents []MemoryEntity
	err := DB.Where("bank_id = ?", bankId).Order("canonical_name ASC").Find(&ents).Error
	return ents, err
}

// MergeEntities merges source entity into target entity.
func MergeEntities(bankId int64, sourceName, targetName string) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		// Update facts
		if err := tx.Model(&MemoryFact{}).Where("bank_id = ? AND entities LIKE ?", bankId, "%,"+sourceName+",%").
			Update("entities", gorm.Expr("REPLACE(entities, ?, ?)", ","+sourceName+",", ","+targetName+",")).Error; err != nil {
			return err
		}
		// Update observations
		if err := tx.Model(&MemoryObservation{}).Where("bank_id = ? AND entities LIKE ?", bankId, "%,"+sourceName+",%").
			Update("entities", gorm.Expr("REPLACE(entities, ?, ?)", ","+sourceName+",", ","+targetName+",")).Error; err != nil {
			return err
		}
		// Update entity relations
		if err := tx.Model(&MemoryEntityRelation{}).Where("bank_id = ? AND source_entity = ?", bankId, sourceName).
			Update("source_entity", targetName).Error; err != nil {
			return err
		}
		if err := tx.Model(&MemoryEntityRelation{}).Where("bank_id = ? AND target_entity = ?", bankId, sourceName).
			Update("target_entity", targetName).Error; err != nil {
			return err
		}
		// Delete source entity
		return tx.Where("bank_id = ? AND canonical_name = ?", bankId, sourceName).Delete(&MemoryEntity{}).Error
	})
}

// --- Decision Models ---

// UpsertDecisionModel creates or updates a decision model config.
func UpsertDecisionModel(bankId int64, modelType, endpoint, apiKey string, config map[string]any, enabled bool) error {
	now := common.GetTimestamp()
	configJSON, _ := json.Marshal(config)
	var existing DecisionModel
	err := DB.Where("bank_id = ? AND model_type = ?", bankId, modelType).First(&existing).Error
	if err == nil {
		return DB.Model(&existing).Updates(map[string]any{
			"endpoint":   endpoint,
			"api_key":    apiKey,
			"config":     string(configJSON),
			"enabled":    enabled,
			"updated_at": now,
		}).Error
	}
	dm := DecisionModel{
		BankId:     bankId,
		ModelType:  modelType,
		Endpoint:   endpoint,
		ApiKey:     apiKey,
		Config:     string(configJSON),
		Enabled:    enabled,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	return DB.Create(&dm).Error
}

// GetDecisionModel returns a decision model config.
func GetDecisionModel(bankId int64, modelType string) (*DecisionModel, error) {
	var dm DecisionModel
	err := DB.Where("bank_id = ? AND model_type = ?", bankId, modelType).First(&dm).Error
	if err != nil {
		return nil, err
	}
	return &dm, nil
}

// ListDecisionModels returns all decision models for a bank.
func ListDecisionModels(bankId int64) ([]DecisionModel, error) {
	var dms []DecisionModel
	err := DB.Where("bank_id = ?", bankId).Find(&dms).Error
	return dms, err
}

// DeleteDecisionModel removes a decision model.
func DeleteDecisionModel(bankId int64, modelType string) error {
	return DB.Where("bank_id = ? AND model_type = ?", bankId, modelType).Delete(&DecisionModel{}).Error
}

// --- Operations (Async) ---

// CreateOperation creates a new async operation record.
func CreateOperation(bankId int64, operationType string, input map[string]any) (*MemoryOperation, error) {
	now := common.GetTimestamp()
	inputJSON, _ := json.Marshal(input)
	op := MemoryOperation{
		BankId:         bankId,
		OperationType:  operationType,
		Status:         "pending",
		Input:          string(inputJSON),
		CreatedAt:      now,
	}
	if err := DB.Create(&op).Error; err != nil {
		return nil, err
	}
	return &op, nil
}

// UpdateOperationStatus updates an operation's status.
func UpdateOperationStatus(opId int64, status string, output map[string]any, errMsg string) error {
	now := common.GetTimestamp()
	updates := map[string]any{
		"status":        status,
		"updated_at":    now,
	}
	if status == "running" {
		updates["started_at"] = now
	}
	if status == "completed" || status == "failed" {
		updates["completed_at"] = now
	}
	if output != nil {
		outputJSON, _ := json.Marshal(output)
		updates["output"] = string(outputJSON)
	}
	if errMsg != "" {
		updates["error"] = errMsg
	}
	return DB.Model(&MemoryOperation{}).Where("id = ?", opId).Updates(updates).Error
}

// GetOperation returns an operation by ID.
func GetOperation(opId int64) (*MemoryOperation, error) {
	var op MemoryOperation
	err := DB.First(&op, opId).Error
	if err != nil {
		return nil, err
	}
	return &op, nil
}

// ListOperations returns operations for a bank.
func ListOperations(bankId int64, status string, limit int) ([]MemoryOperation, error) {
	var ops []MemoryOperation
	q := DB.Where("bank_id = ?", bankId)
	if status != "" {
		q = q.Where("status = ?", status)
	}
	if limit <= 0 {
		limit = 50
	}
	err := q.Order("created_at DESC").Limit(limit).Find(&ops).Error
	return ops, err
}

// --- Webhooks ---

// CreateWebhook creates a new webhook.
func CreateWebhook(bankId int64, url string, events []string, secret string) (*MemoryWebhook, error) {
	now := common.GetTimestamp()
	eventsJSON, _ := json.Marshal(events)
	wh := MemoryWebhook{
		BankId:   bankId,
		Url:      url,
		Events:   string(eventsJSON),
		Secret:   secret,
		Enabled:  true,
		CreatedAt: now,
	}
	if err := DB.Create(&wh).Error; err != nil {
		return nil, err
	}
	return &wh, nil
}

// ListWebhooks returns webhooks for a bank.
func ListWebhooks(bankId int64) ([]MemoryWebhook, error) {
	var whs []MemoryWebhook
	err := DB.Where("bank_id = ?", bankId).Find(&whs).Error
	return whs, err
}

// DeleteWebhook removes a webhook.
func DeleteWebhook(bankId int64, webhookId int64) error {
	return DB.Where("bank_id = ? AND id = ?", bankId, webhookId).Delete(&MemoryWebhook{}).Error
}

// --- Bank Templates ---

// CreateBankTemplate creates a new bank template.
func CreateBankTemplate(name, description string, config map[string]any, isPublic bool) (*MemoryBankTemplate, error) {
	now := common.GetTimestamp()
	configJSON, _ := json.Marshal(config)
	tmpl := MemoryBankTemplate{
		Name:        name,
		Description: description,
		Config:      string(configJSON),
		IsPublic:    isPublic,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := DB.Create(&tmpl).Error; err != nil {
		return nil, err
	}
	return &tmpl, nil
}

// ListBankTemplates returns bank templates.
func ListBankTemplates(isPublicOnly bool) ([]MemoryBankTemplate, error) {
	var tmpls []MemoryBankTemplate
	q := DB
	if isPublicOnly {
		q = q.Where("is_public = ?", true)
	}
	err := q.Order("created_at DESC").Find(&tmpls).Error
	return tmpls, err
}

// GetBankTemplate returns a template by ID.
func GetBankTemplate(id int64) (*MemoryBankTemplate, error) {
	var tmpl MemoryBankTemplate
	err := DB.First(&tmpl, id).Error
	if err != nil {
		return nil, err
	}
	return &tmpl, nil
}

// DeleteBankTemplate removes a template.
func DeleteBankTemplate(id int64) error {
	return DB.Delete(&MemoryBankTemplate{}, id).Error
}

// CreateBankFromTemplate creates a new bank from a template.
func CreateBankFromTemplate(userId int, agentId, name string, templateId int64) (*MemoryBank, error) {
	tmpl, err := GetBankTemplate(templateId)
	if err != nil {
		return nil, err
	}
	var config map[string]any
	if err := json.Unmarshal([]byte(tmpl.Config), &config); err != nil {
		return nil, err
	}
	bank := &MemoryBank{
		UserId:      userId,
		AgentId:     agentId,
		Name:        name,
		Description: tmpl.Description,
	}
	// Apply template config
	if v, ok := config["disposition_skepticism"].(float64); ok {
		bank.DispositionSkepticism = int(v)
	}
	if v, ok := config["disposition_literalism"].(float64); ok {
		bank.DispositionLiteralism = int(v)
	}
	if v, ok := config["disposition_empathy"].(float64); ok {
		bank.DispositionEmpathy = int(v)
	}
	if v, ok := config["mission"].(string); ok {
		bank.Mission = v
	}
	if v, ok := config["background"].(string); ok {
		bank.Background = v
	}
	if v, ok := config["reflect_mission"].(string); ok {
		bank.ReflectMission = v
	}
	if v, ok := config["retain_mission"].(string); ok {
		bank.RetainMission = v
	}
	if v, ok := config["retain_extraction_mode"].(string); ok {
		bank.RetainExtractionMode = v
	}
	if v, ok := config["retain_chunk_size"].(float64); ok {
		bank.RetainChunkSize = int(v)
	}
	if v, ok := config["retain_custom_instructions"].(string); ok {
		bank.RetainCustomInstructions = v
	}
	if v, ok := config["enable_observations"].(bool); ok {
		bank.EnableObservations = v
	}
	if v, ok := config["enable_text_search"].(bool); ok {
		bank.EnableTextSearch = v
	}
	if v, ok := config["enable_temporal_retrieval"].(bool); ok {
		bank.EnableTemporalRetrieval = v
	}
	if v, ok := config["enable_graph_retrieval"].(bool); ok {
		bank.EnableGraphRetrieval = v
	}
	if v, ok := config["enable_reranking"].(bool); ok {
		bank.EnableReranking = v
	}
	if err := CreateMemoryBank(bank); err != nil {
		return nil, err
	}
	return bank, nil
}