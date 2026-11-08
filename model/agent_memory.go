package model

import (
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
type MemoryBank struct {
	Id          int64  `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId    int    `json:"user_id" gorm:"index:idx_mb_user_agent,priority:1"`
	AgentId   string `json:"agent_id" gorm:"type:varchar(128);index:idx_mb_user_agent,priority:2"`
	Name      string `json:"name" gorm:"type:varchar(255)"`
	Description string `json:"description" gorm:"type:text"`
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
}

func (KnowledgePage) TableName() string { return "knowledge_pages" }

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
			"content":      content,
			"payload":      payload,
			"tags":         tags,
			"auto_refresh": autoRefresh,
			"refreshed_at": now,
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
			"title":     title,
			"content":   content,
			"path":      path,
			"updated_at": now,
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
		return tx.Delete(&MemoryBank{}, id).Error
	})
}
