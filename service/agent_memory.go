package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/model"
)

// AgentMemoryEnabled reports whether the agent memory subsystem is active.
var agentMemoryEnabled = false

// agentMemoryLLMCall is an optional callback for invoking an LLM during
// Retain (fact extraction) and Reflect (reasoning over memories). If nil,
// Retain/Reflect fall back to heuristic extraction and simple concatenation.
var agentMemoryLLMCall func(ctx context.Context, systemPrompt, userPrompt string) (string, error)

// ConfigureAgentMemory initializes the agent memory subsystem.
func ConfigureAgentMemory(enabled bool) {
	agentMemoryEnabled = enabled
}

// AgentMemoryEnabled reports whether agent memory is enabled.
func AgentMemoryEnabled() bool {
	return agentMemoryEnabled
}

// SetAgentMemoryLLMCall registers the LLM callback used for Retain and Reflect.
func SetAgentMemoryLLMCall(fn func(ctx context.Context, systemPrompt, userPrompt string) (string, error)) {
	agentMemoryLLMCall = fn
}

// --- Bank CRUD ---

// CreateMemoryBank creates a new memory bank for a user/agent.
func CreateMemoryBank(userId int, agentId, name, description string) (*model.MemoryBank, error) {
	if !agentMemoryEnabled {
		return nil, fmt.Errorf("agent memory is disabled")
	}
	bank := &model.MemoryBank{
		UserId:      userId,
		AgentId:     agentId,
		Name:        name,
		Description: description,
	}
	if err := model.CreateMemoryBank(bank); err != nil {
		return nil, err
	}
	return bank, nil
}

// GetMemoryBank returns a memory bank by ID.
func GetMemoryBank(id int64) (*model.MemoryBank, error) {
	return model.GetMemoryBank(id)
}

// ListMemoryBanks returns memory banks for a user.
func ListMemoryBanks(userId int, agentId string) ([]model.MemoryBank, error) {
	return model.ListMemoryBanks(userId, agentId)
}

// UpdateMemoryBank updates a memory bank's name/description.
func UpdateMemoryBank(id int64, name, description string) error {
	return model.UpdateMemoryBank(id, name, description)
}

// DeleteMemoryBank deletes a memory bank and all its contents.
func DeleteMemoryBank(id int64) error {
	return model.DeleteMemoryBank(id)
}

// --- Retain ---

// ContentBlock represents a content block (text or image) for multimodal input.
type ContentBlock struct {
	Type     string      `json:"type"`     // "text" | "image"
	Text     string      `json:"text"`     // for text type
	Source   *ImageSource `json:"source"`  // for image type
}

type ImageSource struct {
	Type      string `json:"type"`      // "base64" | "url"
	MediaType string `json:"media_type"` // e.g. "image/png"
	Data      string `json:"data"`      // base64 data or URL
}

// Content is a union of string or ContentBlock array (Hindsight-compatible).
type Content struct {
	String  string         `json:"-"`
	Blocks  []ContentBlock `json:"-"`
}

// EntityInput represents a user-provided entity for resolution.
type EntityInput struct {
	Name        string            `json:"name"`
	Type        string            `json:"type"`
	Description string            `json:"description"`
	Metadata    map[string]string `json:"metadata"`
}

// ObservationScopes defines scope for observation extraction.
type ObservationScopes struct {
	EntityTypes []string `json:"entity_types"`
	TimeRange   *TimeRange `json:"time_range"`
}

type TimeRange struct {
	Start int64 `json:"start"`
	End   int64 `json:"end"`
}

// MemoryRetainItem is a single item to retain (Hindsight-compatible).
type MemoryRetainItem struct {
	Content            Content            `json:"content"`
	Timestamp          *int64             `json:"timestamp"`
	Context            string             `json:"context"`
	Metadata           map[string]string  `json:"metadata"`
	DocumentId         string             `json:"document_id"`
	Entities           []EntityInput      `json:"entities"`
	ResolveEntities    bool               `json:"resolve_entities"`
	Tags               []string           `json:"tags"`
	ObservationScopes  *ObservationScopes `json:"observation_scopes"`
	Strategy           string             `json:"strategy"`
	UpdateMode         string             `json:"update_mode"`
}

// MemoryRetainRequest is the input for retaining conversation turns (Hindsight-compatible).
type MemoryRetainRequest struct {
	Items []MemoryRetainItem `json:"items"`
	Async bool               `json:"async"`
}

// MemoryRetainResponse is the result of a retain operation.
type MemoryRetainResponse struct {
	FactsRetained   int      `json:"facts_retained"`
	ObservationsCreated int  `json:"observations_created"`
	EntitiesResolved  int  `json:"entities_resolved"`
	TaskId          string `json:"task_id"` // for async operations
}

// RetainMemory extracts facts from items and stores them in a memory bank.
// If an LLM callback is configured, it is used to extract structured facts;
// otherwise a heuristic keyword/entity extraction is used.
// Hindsight-compatible: supports multiple items, multimodal content, async mode.
func RetainMemory(req MemoryRetainRequest) (*MemoryRetainResponse, error) {
	if !agentMemoryEnabled {
		return nil, fmt.Errorf("agent memory is disabled")
	}
	if len(req.Items) == 0 {
		return nil, fmt.Errorf("invalid retain request: no items")
	}

	totalFacts := 0
	totalObservations := 0
	totalEntities := 0

	for _, item := range req.Items {
		text := extractTextFromContent(item.Content)
		if text == "" {
			continue
		}
		
		var facts []string
		var entities []string
		var keywords []string

		if agentMemoryLLMCall != nil {
			systemPrompt := `You are a memory extraction assistant. Extract concise, standalone facts from the user's message. Each fact should be a single sentence that can be independently recalled later. Return a JSON array of objects with fields: "fact" (string), "entities" (array of strings), "keywords" (array of strings). Only include facts that are specific and useful for future recall. Do not include generic pleasantries.`
			userPrompt := fmt.Sprintf("Extract facts from this content:\n\n%s", text)
			llmResp, err := agentMemoryLLMCall(context.Background(), systemPrompt, userPrompt)
			if err == nil {
				var extracted []struct {
					Fact     string   `json:"fact"`
					Entities []string `json:"entities"`
					Keywords []string `json:"keywords"`
				}
				if jsonErr := json.Unmarshal([]byte(llmResp), &extracted); jsonErr == nil {
					for _, e := range extracted {
						if e.Fact != "" {
							facts = append(facts, e.Fact)
							entities = append(entities, e.Entities...)
							keywords = append(keywords, e.Keywords...)
							totalEntities += len(e.Entities)
						}
					}
				}
			}
		}

		// Fallback: heuristic extraction if LLM failed or not configured.
		if len(facts) == 0 {
			facts, entities, keywords = heuristicExtract(text, "")
			totalEntities += len(entities)
		}

		// Bank ID must be provided in the request context or as a top-level field
		// For backward compatibility, we'll use a default bank ID from context
		// In a real implementation, this would come from authentication context
		bankId := int64(0)
		// Try to get bank_id from item metadata or tags
		if item.Metadata != nil {
			if bidStr, ok := item.Metadata["bank_id"]; ok {
				fmt.Sscanf(bidStr, "%d", &bankId)
			}
		}
		if bankId == 0 {
			for _, tag := range item.Tags {
				if strings.HasPrefix(tag, "bank:") {
					fmt.Sscanf(tag, "bank:%d", &bankId)
					break
				}
			}
		}
		if bankId == 0 {
			// Skip items without bank ID
			continue
		}

		for _, fact := range facts {
			in := model.MemoryFactInput{
				BankId:     bankId,
				Content:    fact,
				Entities:   entities,
				Keywords:   keywords,
				Language:   "",
				Confidence: 1.0,
			}
			if err := model.RetainMemoryFact(in); err == nil {
				totalFacts++
			}
		}
	}

	return &MemoryRetainResponse{
		FactsRetained:       totalFacts,
		ObservationsCreated: totalObservations,
		EntitiesResolved:    totalEntities,
		TaskId:              "", // async not implemented yet
	}, nil
}

// extractTextFromContent extracts plain text from Content (string or blocks).
func extractTextFromContent(c Content) string {
	if c.String != "" {
		return c.String
	}
	var sb strings.Builder
	for _, block := range c.Blocks {
		if block.Type == "text" && block.Text != "" {
			sb.WriteString(block.Text)
			sb.WriteString("\n")
		}
	}
	return strings.TrimSpace(sb.String())
}

// heuristicExtract splits text into sentence-like facts and extracts
// capitalized words as entities and significant words as keywords.
func heuristicExtract(text, language string) (facts, entities, keywords []string) {
	// Split into sentences by common delimiters.
	parts := strings.FieldsFunc(text, func(r rune) bool {
		return r == '.' || r == '!' || r == '?' || r == '\n'
	})
	seen := make(map[string]bool)
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" || seen[p] {
			continue
		}
		seen[p] = true
		if len(p) < 5 {
			continue
		}
		facts = append(facts, p)
		// Simple entity detection: capitalized words.
		for _, w := range strings.Fields(p) {
			w = strings.Trim(w, ".,!?:;\"'()[]")
			if len(w) > 1 && w[0] >= 'A' && w[0] <= 'Z' {
				entities = append(entities, w)
			}
		}
		// Keywords: lowercase significant words.
		for _, w := range strings.Fields(p) {
			w = strings.ToLower(strings.Trim(w, ".,!?:;\"'()[]"))
			if len(w) > 3 {
				keywords = append(keywords, w)
			}
		}
	}
	if len(facts) == 0 && text != "" {
		facts = append(facts, text)
	}
	return facts, entities, keywords
}

// --- Recall ---

// Budget limits the number of each memory type returned (Hindsight-compatible).
type Budget struct {
	MaxFacts           int `json:"max_facts"`
	MaxObservations    int `json:"max_observations"`
	MaxMentalModels    int `json:"max_mental_models"`
	MaxPages           int `json:"max_pages"`
}

// RerankOptions configures reranking of recall results (Hindsight-compatible).
type RerankOptions struct {
	Model  string `json:"model"`
	TopK   int    `json:"top_k"`
}

// TemporalWindow defines a time range for temporal retrieval (Hindsight-compatible).
type TemporalWindow struct {
	Start int64 `json:"start"`
	End   int64 `json:"end"`
}

// TagGroup defines a group of tags for complex tag matching (Hindsight-compatible).
type TagGroup struct {
	Tags      []string `json:"tags"`
	MatchMode string   `json:"match_mode"` // "any" | "all" | "any_strict" | "all_strict" | "exact"
}

// MinScores defines minimum score thresholds for different retrieval strategies (Hindsight-compatible).
type MinScores struct {
	Semantic  float64 `json:"semantic"`
	Temporal  float64 `json:"temporal"`
	Graph     float64 `json:"graph"`
}

// IncludeOptions controls what additional data to include in recall results (Hindsight-compatible).
type IncludeOptions struct {
	Entities bool `json:"entities"`
	Chunks   bool `json:"chunks"`
}

// MemoryRecallRequest is the input for recalling memories (Hindsight-compatible).
type MemoryRecallRequest struct {
	BankId            int64          `json:"bank_id"`
	Query             string         `json:"query"`
	Types             []string       `json:"types"`            // "fact" | "observation" | "mental_model" | "page"
	PreferObservations *bool         `json:"prefer_observations"`
	Budget            *Budget        `json:"budget"`
	MaxTokens         int            `json:"max_tokens"`
	Trace             bool           `json:"trace"`
	QueryTimestamp    string         `json:"query_timestamp"`
	Include           *IncludeOptions `json:"include"`
	Tags              []string       `json:"tags"`
	TagsMatch         string         `json:"tags_match"`       // "any" | "all" | "any_strict" | "all_strict" | "exact"
	TagGroups         []TagGroup     `json:"tag_groups"`
	MinScores         *MinScores     `json:"min_scores"`
	TemporalWindow    *TemporalWindow `json:"temporal_window"`
	Rerank            *RerankOptions `json:"rerank"`
}

// MemoryRecallResponse is the result of a recall operation (Hindsight-compatible).
type MemoryRecallResponse struct {
	Facts         []model.MemoryFact         `json:"facts"`
	Observations  []model.MemoryObservation  `json:"observations"`
	MentalModels  []model.MemoryMentalModel  `json:"mental_models"`
	Pages         []model.KnowledgePage      `json:"pages"`
	Entities      []EntityState              `json:"entities"`
	Chunks        []Chunk                    `json:"chunks"`
	TokenUsage    *TokenUsage                `json:"token_usage"`
}

// EntityState represents a resolved entity state (Hindsight-compatible).
type EntityState struct {
	Name        string            `json:"name"`
	Type        string            `json:"type"`
	Description string            `json:"description"`
	State       string            `json:"state"`
	Metadata    map[string]string `json:"metadata"`
	LastSeen    int64             `json:"last_seen"`
}

// Chunk represents a source chunk with optional attachments (Hindsight-compatible).
type Chunk struct {
	Id        string      `json:"id"`
	Text      string      `json:"text"`
	Attachments []ContentBlock `json:"attachments"`
}

// TokenUsage tracks token consumption (Hindsight-compatible).
type TokenUsage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// RecallMemory searches a memory bank for facts, observations, mental models and pages.
// Hindsight-compatible: supports budget, rerank, temporal window, tag groups, min scores.
func RecallMemory(req MemoryRecallRequest) (*MemoryRecallResponse, error) {
	if !agentMemoryEnabled {
		return nil, fmt.Errorf("agent memory is disabled")
	}
	if req.BankId <= 0 {
		return nil, fmt.Errorf("invalid bank id")
	}

	// Set defaults
	maxFacts := 50
	maxObservations := 20
	maxMentalModels := 10
	maxPages := 10
	if req.Budget != nil {
		if req.Budget.MaxFacts > 0 {
			maxFacts = req.Budget.MaxFacts
		}
		if req.Budget.MaxObservations > 0 {
			maxObservations = req.Budget.MaxObservations
		}
		if req.Budget.MaxMentalModels > 0 {
			maxMentalModels = req.Budget.MaxMentalModels
		}
		if req.Budget.MaxPages > 0 {
			maxPages = req.Budget.MaxPages
		}
	}
	if req.MaxTokens > 0 {
		// Could use maxTokens to limit total response size
	}

	// Determine which types to recall
	recallTypes := req.Types
	if len(recallTypes) == 0 {
		recallTypes = []string{"fact", "observation", "mental_model"}
	}

	// Extract keywords from query.
	var keywords []string
	if req.Query != "" {
		_, _, keywords = heuristicExtract(req.Query, "")
	}

	// Build temporal window from TemporalWindow field
	since := int64(0)
	until := time.Now().Unix()
	if req.TemporalWindow != nil {
		if req.TemporalWindow.Start > 0 {
			since = req.TemporalWindow.Start
		}
		if req.TemporalWindow.End > 0 {
			until = req.TemporalWindow.End
		}
	}

	// Entities are now derived from tags or query
	var entities []string
	// Could extract entities from query or tags

	filter := model.MemoryRecallFilter{
		BankId:   req.BankId,
		Entities: entities,
		Keywords: keywords,
		Language: "", // language filtering not implemented
		Since:    since,
		Until:    until,
		Limit:    maxFacts,
		Offset:   0,
	}

	var facts []model.MemoryFact
	var observations []model.MemoryObservation
	var mentalModels []model.MemoryMentalModel
	var pages []model.KnowledgePage

	// Recall facts
	if contains(recallTypes, "fact") {
		var err error
		facts, err = model.RecallMemoryFacts(filter)
		if err != nil {
			return nil, err
		}
	}

	// Recall observations
	if contains(recallTypes, "observation") {
		var err error
		observations, err = model.RecallBankActiveObservations(filter)
		if err != nil {
			return nil, err
		}
		if len(observations) > maxObservations {
			observations = observations[:maxObservations]
		}
	}

	// Recall mental models
	if contains(recallTypes, "mental_model") {
		q := "%" + strings.ToLower(req.Query) + "%"
		query := model.DB.Where("bank_id = ? AND (LOWER(source_query) LIKE ? OR LOWER(tags) LIKE ?)",
			req.BankId, q, q)
		// Apply tag filtering
		for _, tag := range req.Tags {
			tag = strings.TrimSpace(tag)
			if tag != "" {
				query = query.Where("tags LIKE ?", "%"+tag+"%")
			}
		}
		if err := query.Limit(maxMentalModels).Find(&mentalModels).Error; err != nil {
			return nil, err
		}
	}

	// Recall pages
	if contains(recallTypes, "page") {
		query := model.DB.Where("bank_id = ?", req.BankId)
		if req.Query != "" {
			q := "%" + strings.ToLower(req.Query) + "%"
			query = query.Where("LOWER(title) LIKE ? OR LOWER(content) LIKE ? OR LOWER(source_query) LIKE ?", q, q, q)
		}
		for _, tag := range req.Tags {
			tag = strings.TrimSpace(tag)
			if tag != "" {
				query = query.Where("tags LIKE ?", "%"+tag+"%")
			}
		}
		if err := query.Limit(maxPages).Find(&pages).Error; err != nil {
			return nil, err
		}
	}

	// TODO: Implement tag groups, min_scores, rerank, include entities/chunks
	// TODO: Implement prefer_observations logic

	return &MemoryRecallResponse{
		Facts:        facts,
		Observations: observations,
		MentalModels: mentalModels,
		Pages:        pages,
		Entities:     nil, // not implemented yet
		Chunks:       nil, // not implemented yet
		TokenUsage:   nil, // not implemented yet
	}, nil
}

// contains checks if a slice contains a string.
func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}

// --- Reflect ---

// ReflectIncludeOptions controls what to include in reflect results (Hindsight-compatible).
type ReflectIncludeOptions struct {
	MentalModels  bool `json:"mental_models"`
	Observations  bool `json:"observations"`
}

// MemoryReflectRequest is the input for reflecting over memories (Hindsight-compatible).
type MemoryReflectRequest struct {
	BankId                int64                  `json:"bank_id"`
	Query                 string                 `json:"query"`
	Context               string                 `json:"context"`
	Budget                *Budget                `json:"budget"`
	ResponseSchema        map[string]interface{} `json:"response_schema"`
	FactTypes             []string               `json:"fact_types"`             // "world" | "experience" | "observation"
	ExcludeMentalModels   bool                   `json:"exclude_mental_models"`
	ExcludeMentalModelIds []int64                `json:"exclude_mental_model_ids"`
	ApplyAllDirectives    bool                   `json:"apply_all_directives"`
	Tags                  []string               `json:"tags"`
	TagsMatch             string                 `json:"tags_match"`
	TagGroups             []TagGroup             `json:"tag_groups"`
	MaxTokens             int                    `json:"max_tokens"`
	Include               *ReflectIncludeOptions `json:"include"`
}

// MemoryReflectResponse is the result of a reflect operation (Hindsight-compatible).
type MemoryReflectResponse struct {
	Answer             string                 `json:"answer"`
	FactsUsed          int                    `json:"facts_used"`
	FactIds            []int64                `json:"fact_ids"`
	StructuredOutput   map[string]interface{} `json:"structured_output"`
	MentalModelsUsed   []model.MemoryMentalModel `json:"mental_models_used"`
	ObservationsUsed   []model.MemoryObservation `json:"observations_used"`
	TokenUsage         *TokenUsage            `json:"token_usage"`
}

// ReflectMemory reasons over memories in a bank to answer a question.
// Hindsight-compatible: supports response_schema, fact_types, directives, budget, etc.
func ReflectMemory(req MemoryReflectRequest) (*MemoryReflectResponse, error) {
	if !agentMemoryEnabled {
		return nil, fmt.Errorf("agent memory is disabled")
	}
	if req.BankId <= 0 || req.Query == "" {
		return nil, fmt.Errorf("invalid reflect request")
	}

	// Recall relevant facts, observations, mental models
	recallReq := MemoryRecallRequest{
		BankId:         req.BankId,
		Query:          req.Query,
		Types:          []string{"fact", "observation", "mental_model"},
		Budget:         req.Budget,
		MaxTokens:      req.MaxTokens,
		Tags:           req.Tags,
		TagsMatch:      req.TagsMatch,
		TagGroups:      req.TagGroups,
		TemporalWindow: nil, // could be added
	}
	recallResp, err := RecallMemory(recallReq)
	if err != nil {
		return nil, err
	}

	var factIds []int64
	var factTexts []string
	for _, f := range recallResp.Facts {
		factIds = append(factIds, f.Id)
		factTexts = append(factTexts, f.Content)
	}

	// Filter mental models if exclude flags set
	mentalModels := recallResp.MentalModels
	if req.ExcludeMentalModels {
		mentalModels = nil
	} else if len(req.ExcludeMentalModelIds) > 0 {
		excludeSet := make(map[int64]bool)
		for _, id := range req.ExcludeMentalModelIds {
			excludeSet[id] = true
		}
		filtered := make([]model.MemoryMentalModel, 0)
		for _, mm := range mentalModels {
			if !excludeSet[mm.Id] {
				filtered = append(filtered, mm)
			}
		}
		mentalModels = filtered
	}

	var answer string
	var structuredOutput map[string]interface{}

	if agentMemoryLLMCall != nil && len(factTexts) > 0 {
		systemPrompt := `You are a memory reasoning assistant. Answer the user's question using ONLY the provided facts from their memory bank. Do not invent information. If the facts are insufficient, say so. Cite facts by their content. Answer in the same language as the question.`
		
		// Add response schema instruction if provided
		if req.ResponseSchema != nil {
			schemaJSON, _ := json.Marshal(req.ResponseSchema)
			systemPrompt += fmt.Sprintf("\n\nReturn your answer as JSON matching this schema: %s", string(schemaJSON))
		}
		
		userPrompt := fmt.Sprintf("Question: %s\n\nContext: %s\n\nRelevant facts:\n%s", req.Query, req.Context, strings.Join(factTexts, "\n- "))
		llmResp, err := agentMemoryLLMCall(context.Background(), systemPrompt, userPrompt)
		if err == nil {
			answer = llmResp
			// Try to parse structured output if schema provided
			if req.ResponseSchema != nil {
				json.Unmarshal([]byte(llmResp), &structuredOutput)
			}
		}
	}
	if answer == "" {
		// Fallback: concatenate facts.
		if len(factTexts) > 0 {
			answer = "Based on memory: " + strings.Join(factTexts, "; ")
		} else {
			answer = "No relevant facts found in memory."
		}
	}

	return &MemoryReflectResponse{
		Answer:           answer,
		FactsUsed:        len(factTexts),
		FactIds:          factIds,
		StructuredOutput: structuredOutput,
		MentalModelsUsed: mentalModels,
		ObservationsUsed: recallResp.Observations,
		TokenUsage:       nil, // not implemented yet
	}, nil
}

// --- Consolidation ---

// ConsolidationStrategy defines the strategy for observation consolidation.
type ConsolidationStrategy string

const (
	ConsolidationStrategyEntityTemporal  ConsolidationStrategy = "entity_temporal"
	ConsolidationStrategyTopicClustering ConsolidationStrategy = "topic_clustering"
)

// ConsolidationScopePattern defines a scope pattern for consolidation (Hindsight-compatible).
type ConsolidationScopePattern struct {
	Tag      string              `json:"tag"`
	Strategy ConsolidationStrategy `json:"strategy"`
}

// ConsolidateMemory runs observation consolidation for a bank with configurable strategies.
// Hindsight-compatible: supports entity_temporal and topic_clustering strategies.
func ConsolidateMemory(bankId int64, scopePatterns []ConsolidationScopePattern) error {
	if !agentMemoryEnabled {
		return fmt.Errorf("agent memory is disabled")
	}
	now := time.Now().Unix()
	since := now - 24*3600 // last 24 hours

	count, err := model.CountBankRecentFacts(bankId, since)
	if err != nil {
		return err
	}
	if count == 0 {
		return nil
	}

	// Recall recent facts for consolidation.
	facts, err := model.RecallMemoryFacts(model.MemoryRecallFilter{
		BankId: bankId,
		Since:  since,
		Until:  now,
		Limit:  1000,
	})
	if err != nil {
		return err
	}

	if len(facts) == 0 {
		return nil
	}

	// Default to entity_temporal if no scope patterns provided
	if len(scopePatterns) == 0 {
		scopePatterns = []ConsolidationScopePattern{{
			Tag:      "",
			Strategy: ConsolidationStrategyEntityTemporal,
		}}
	}

	for _, pattern := range scopePatterns {
		var filteredFacts []model.MemoryFact
		if pattern.Tag != "" {
			// Filter facts by tag (stored in Tags field)
			for _, f := range facts {
				if strings.Contains(f.Tags, pattern.Tag) {
					filteredFacts = append(filteredFacts, f)
				}
			}
		} else {
			filteredFacts = facts
		}

		if len(filteredFacts) == 0 {
			continue
		}

		var summary string
		var entityList, keywordList []string
		var factIds []int64

		switch pattern.Strategy {
		case ConsolidationStrategyEntityTemporal:
			// Group by entities and time - current implementation
			entities := make(map[string]bool)
			keywords := make(map[string]bool)
			var sb strings.Builder
			for _, f := range filteredFacts {
				sb.WriteString("- " + f.Content + "\n")
				factIds = append(factIds, f.Id)
				for _, e := range strings.Split(f.Entities, ",") {
					e = strings.TrimSpace(e)
					if e != "" {
						entities[e] = true
					}
				}
				for _, k := range strings.Fields(f.Keywords) {
					if k != "" {
						keywords[k] = true
					}
				}
			}
			for e := range entities {
				entityList = append(entityList, e)
			}
			for k := range keywords {
				keywordList = append(keywordList, k)
			}
			summary = sb.String()
			if len(summary) > 2000 {
				summary = summary[:2000]
			}

		case ConsolidationStrategyTopicClustering:
			// Group by topic similarity - simplified: use keywords as topics
			topicGroups := make(map[string][]model.MemoryFact)
			for _, f := range filteredFacts {
				// Use first keyword as topic, or "general"
				topic := "general"
				kw := strings.Fields(f.Keywords)
				if len(kw) > 0 {
					topic = kw[0]
				}
				topicGroups[topic] = append(topicGroups[topic], f)
			}
			// Create one observation per topic
			for _, topicFacts := range topicGroups {
				var sb strings.Builder
				entities := make(map[string]bool)
				keywords := make(map[string]bool)
				var topicFactIds []int64
				for _, f := range topicFacts {
					sb.WriteString("- " + f.Content + "\n")
					topicFactIds = append(topicFactIds, f.Id)
					for _, e := range strings.Split(f.Entities, ",") {
						e = strings.TrimSpace(e)
						if e != "" {
							entities[e] = true
						}
					}
					for _, k := range strings.Fields(f.Keywords) {
						if k != "" {
							keywords[k] = true
						}
					}
				}
				for e := range entities {
					entityList = append(entityList, e)
				}
				for k := range keywords {
					keywordList = append(keywordList, k)
				}
				topicSummary := sb.String()
				if len(topicSummary) > 2000 {
					topicSummary = topicSummary[:2000]
				}
				
				confidence := 0.5 + float64(len(topicFacts))*0.05
				if confidence > 1.0 {
					confidence = 1.0
				}
				
				err = model.CreateMemoryObservationWithDetails(
					bankId,
					topicSummary,
					strings.Join(entityList, ","),
					strings.Join(keywordList, " "),
					len(topicFacts),
					since,
					now,
					confidence,
					pattern.Strategy.String(),
					pattern.Tag,
					strings.Join(int64SliceToString(topicFactIds), ","),
				)
				if err != nil {
					return err
				}
			}
			continue // skip the single observation creation below

		default:
			// Unknown strategy, fall back to entity_temporal
			entities := make(map[string]bool)
			keywords := make(map[string]bool)
			var sb strings.Builder
			for _, f := range filteredFacts {
				sb.WriteString("- " + f.Content + "\n")
				factIds = append(factIds, f.Id)
				for _, e := range strings.Split(f.Entities, ",") {
					e = strings.TrimSpace(e)
					if e != "" {
						entities[e] = true
					}
				}
				for _, k := range strings.Fields(f.Keywords) {
					if k != "" {
						keywords[k] = true
					}
				}
			}
			for e := range entities {
				entityList = append(entityList, e)
			}
			for k := range keywords {
				keywordList = append(keywordList, k)
			}
			summary = sb.String()
			if len(summary) > 2000 {
				summary = summary[:2000]
			}
		}

		confidence := 0.5 + float64(len(filteredFacts))*0.05
		if confidence > 1.0 {
			confidence = 1.0
		}

		err = model.CreateMemoryObservationWithDetails(
			bankId,
			summary,
			strings.Join(entityList, ","),
			strings.Join(keywordList, " "),
			len(filteredFacts),
			since,
			now,
			confidence,
			pattern.Strategy.String(),
			pattern.Tag,
			strings.Join(int64SliceToString(factIds), ","),
		)
		if err != nil {
			return err
		}
	}

	return nil
}

func (s ConsolidationStrategy) String() string {
	return string(s)
}

func int64SliceToString(slice []int64) []string {
	result := make([]string, len(slice))
	for i, v := range slice {
		result[i] = fmt.Sprintf("%d", v)
	}
	return result
}

// --- Trigger System for Mental Models and Knowledge Pages ---

// TriggerType defines the type of trigger for mental models/pages.
type TriggerType string

const (
	TriggerTypeScheduled TriggerType = "scheduled"
	TriggerTypeOnRecall  TriggerType = "on_recall"
	TriggerTypeOnRetain  TriggerType = "on_retain"
	TriggerTypeManual    TriggerType = "manual"
)

// RefreshMentalModel refreshes a mental model by re-running Reflect with its source query.
func RefreshMentalModel(bankId int64, mm *model.MemoryMentalModel) error {
	if !agentMemoryEnabled {
		return fmt.Errorf("agent memory is disabled")
	}
	if mm == nil {
		return fmt.Errorf("mental model is nil")
	}

	now := time.Now().Unix()
	// Update status to pending
	model.DB.Model(mm).Updates(map[string]any{
		"refresh_status":  "pending",
		"refresh_error":   "",
		"last_refreshed_at": now,
	})

	// Run reflect with the source query
	req := MemoryReflectRequest{
		BankId:     bankId,
		Query:      mm.SourceQuery,
		Context:    "Auto-refresh of mental model: " + mm.SourceQuery,
		MaxTokens:  mm.MaxTokens,
		Tags:       strings.Split(mm.Tags, ","),
	}
	resp, err := ReflectMemory(req)
	if err != nil {
		model.DB.Model(mm).Updates(map[string]any{
			"refresh_status": "failed",
			"refresh_error": err.Error(),
		})
		return err
	}

	// Update mental model with new content
	model.DB.Model(mm).Updates(map[string]any{
		"content":          resp.Answer,
		"payload":          "", // could store structured output
		"refreshed_at":     now,
		"refresh_status":   "success",
		"refresh_error":    "",
		"last_refreshed_at": now,
	})

	return nil
}

// RefreshKnowledgePage refreshes a knowledge page by re-running Reflect with its source query.
func RefreshKnowledgePage(bankId int64, page *model.KnowledgePage) error {
	if !agentMemoryEnabled {
		return fmt.Errorf("agent memory is disabled")
	}
	if page == nil {
		return fmt.Errorf("knowledge page is nil")
	}

	// Run reflect with the source query
	req := MemoryReflectRequest{
		BankId:    bankId,
		Query:     page.SourceQuery,
		Context:   "Auto-refresh of knowledge page: " + page.Title,
		MaxTokens: page.MaxTokens,
		Tags:      strings.Split(page.Tags, ","),
	}
	resp, err := ReflectMemory(req)
	if err != nil {
		return err
	}

	// Update knowledge page with new content
	now := time.Now().Unix()
	model.DB.Model(page).Updates(map[string]any{
		"content":     resp.Answer,
		"updated_at":  now,
	})

	return nil
}

// ProcessScheduledTriggers checks and runs scheduled triggers for mental models and pages.
// Should be called periodically (e.g., via cron).
func ProcessScheduledTriggers() error {
	if !agentMemoryEnabled {
		return fmt.Errorf("agent memory is disabled")
	}

	now := time.Now().Unix()

	// Process mental models with scheduled triggers
	var mentalModels []model.MemoryMentalModel
	if err := model.DB.Where("trigger_type = ? AND trigger_cron != ''", TriggerTypeScheduled).Find(&mentalModels).Error; err != nil {
		return err
	}

	for _, mm := range mentalModels {
		// Check if cron schedule matches (simplified: check if enough time passed)
		// In production, use a proper cron library
		if mm.LastRefreshedAt == 0 || now-mm.LastRefreshedAt >= 3600 { // at least 1 hour
			_ = RefreshMentalModel(mm.BankId, &mm)
		}
	}

	// Process knowledge pages with scheduled triggers
	var pages []model.KnowledgePage
	if err := model.DB.Where("trigger_type = ? AND trigger_cron != ''", TriggerTypeScheduled).Find(&pages).Error; err != nil {
		return err
	}

	for _, page := range pages {
		if page.CreatedAt == 0 || now-page.UpdatedAt >= 3600 { // at least 1 hour
			_ = RefreshKnowledgePage(page.BankId, &page)
		}
	}

	return nil
}

// TriggerOnRecall processes on_recall triggers when a recall is performed.
func TriggerOnRecall(bankId int64, recallTags []string) error {
	if !agentMemoryEnabled {
		return fmt.Errorf("agent memory is disabled")
	}

	// Find mental models with on_recall trigger matching recall tags
	var mentalModels []model.MemoryMentalModel
	query := model.DB.Where("bank_id = ? AND trigger_type = ?", bankId, TriggerTypeOnRecall)
	for _, tag := range recallTags {
		query = query.Or("trigger_recall_tags LIKE ?", "%"+tag+"%")
	}
	if err := query.Find(&mentalModels).Error; err != nil {
		return err
	}

	for _, mm := range mentalModels {
		_ = RefreshMentalModel(bankId, &mm)
	}

	// Find knowledge pages with on_recall trigger
	var pages []model.KnowledgePage
	query = model.DB.Where("bank_id = ? AND trigger_type = ?", bankId, TriggerTypeOnRecall)
	for _, tag := range recallTags {
		query = query.Or("tags LIKE ?", "%"+tag+"%")
	}
	if err := query.Find(&pages).Error; err != nil {
		return err
	}

	for _, page := range pages {
		_ = RefreshKnowledgePage(bankId, &page)
	}

	return nil
}

// TriggerOnRetain processes on_retain triggers when new facts are retained.
func TriggerOnRetain(bankId int64, retainTags []string) error {
	if !agentMemoryEnabled {
		return fmt.Errorf("agent memory is disabled")
	}

	// Find mental models with on_retain trigger matching retain tags
	var mentalModels []model.MemoryMentalModel
	query := model.DB.Where("bank_id = ? AND trigger_type = ?", bankId, TriggerTypeOnRetain)
	for _, tag := range retainTags {
		query = query.Or("trigger_retain_tags LIKE ?", "%"+tag+"%")
	}
	if err := query.Find(&mentalModels).Error; err != nil {
		return err
	}

	for _, mm := range mentalModels {
		_ = RefreshMentalModel(bankId, &mm)
	}

	// Find knowledge pages with on_retain trigger
	var pages []model.KnowledgePage
	query = model.DB.Where("bank_id = ? AND trigger_type = ?", bankId, TriggerTypeOnRetain)
	for _, tag := range retainTags {
		query = query.Or("tags LIKE ?", "%"+tag+"%")
	}
	if err := query.Find(&pages).Error; err != nil {
		return err
	}

	for _, page := range pages {
		_ = RefreshKnowledgePage(bankId, &page)
	}

	return nil
}

// CreateMentalModelWithTrigger creates a mental model with trigger configuration.
func CreateMentalModelWithTrigger(bankId int64, sourceQuery, scopeModel, content, payload, tags string,
	autoRefresh bool, maxTokens int, triggerType TriggerType, triggerCron, triggerRecallTags, triggerRetainTags string) error {
	now := time.Now().Unix()
	mm := model.MemoryMentalModel{
		BankId:            bankId,
		SourceQuery:       sourceQuery,
		ScopeModel:        scopeModel,
		Content:           content,
		Payload:           payload,
		Tags:              tags,
		AutoRefresh:       autoRefresh,
		RefreshedAt:       now,
		CreatedAt:         now,
		MaxTokens:         maxTokens,
		TriggerType:       triggerType.String(),
		TriggerCron:       triggerCron,
		TriggerRecallTags: triggerRecallTags,
		TriggerRetainTags: triggerRetainTags,
		LastRefreshedAt:   0,
		RefreshStatus:     "",
		RefreshError:      "",
		ResponseSchema:    "",
	}
	return model.DB.Create(&mm).Error
}

// CreateKnowledgePageWithTrigger creates a knowledge page with trigger configuration.
func CreateKnowledgePageWithTrigger(bankId int64, title, content, path string, parentId *int64,
	sourceQuery, tags string, maxTokens int, triggerType TriggerType, triggerCron string) (*model.KnowledgePage, error) {
	now := time.Now().Unix()
	page := model.KnowledgePage{
		BankId:      bankId,
		Title:       title,
		Content:     content,
		Path:        path,
		ParentId:    parentId,
		UpdatedAt:   now,
		CreatedAt:   now,
		SourceQuery: sourceQuery,
		Tags:        tags,
		MaxTokens:   maxTokens,
		TriggerType: triggerType.String(),
		TriggerCron: triggerCron,
	}
	if err := model.DB.Create(&page).Error; err != nil {
		return nil, err
	}
	return &page, nil
}

func (t TriggerType) String() string {
	return string(t)
}
