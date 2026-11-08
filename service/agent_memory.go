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

// MemoryRetainRequest is the input for retaining a conversation turn.
type MemoryRetainRequest struct {
	BankId   int64  `json:"bank_id"`
	Text     string `json:"text"`
	Role     string `json:"role"` // "user", "assistant", "system"
	Language string `json:"language"`
}

// MemoryRetainResponse is the result of a retain operation.
type MemoryRetainResponse struct {
	FactsRetained int `json:"facts_retained"`
}

// RetainMemory extracts facts from text and stores them in a memory bank.
// If an LLM callback is configured, it is used to extract structured facts;
// otherwise a heuristic keyword/entity extraction is used.
func RetainMemory(req MemoryRetainRequest) (*MemoryRetainResponse, error) {
	if !agentMemoryEnabled {
		return nil, fmt.Errorf("agent memory is disabled")
	}
	if req.BankId <= 0 || req.Text == "" {
		return nil, fmt.Errorf("invalid retain request")
	}

	var facts []string
	var entities []string
	var keywords []string

	if agentMemoryLLMCall != nil {
		systemPrompt := `You are a memory extraction assistant. Extract concise, standalone facts from the user's message. Each fact should be a single sentence that can be independently recalled later. Return a JSON array of objects with fields: "fact" (string), "entities" (array of strings), "keywords" (array of strings). Only include facts that are specific and useful for future recall. Do not include generic pleasantries.`
		userPrompt := fmt.Sprintf("Extract facts from this message (role=%s, language=%s):\n\n%s", req.Role, req.Language, req.Text)
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
					}
				}
			}
		}
	}

	// Fallback: heuristic extraction if LLM failed or not configured.
	if len(facts) == 0 {
		facts, entities, keywords = heuristicExtract(req.Text, req.Language)
	}

	retained := 0
	for _, fact := range facts {
		in := model.MemoryFactInput{
			BankId:     req.BankId,
			Content:    fact,
			Entities:   entities,
			Keywords:   keywords,
			Language:   req.Language,
			Confidence: 1.0,
		}
		if err := model.RetainMemoryFact(in); err == nil {
			retained++
		}
	}

	return &MemoryRetainResponse{FactsRetained: retained}, nil
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

// MemoryRecallRequest is the input for recalling memories.
type MemoryRecallRequest struct {
	BankId   int64   `json:"bank_id"`
	Query    string  `json:"query"`
	Entities []string `json:"entities"`
	Language string  `json:"language"`
	Since    int64   `json:"since"`
	Until    int64   `json:"until"`
	Limit    int     `json:"limit"`
}

// MemoryRecallResponse is the result of a recall operation.
type MemoryRecallResponse struct {
	Facts         []model.MemoryFact         `json:"facts"`
	Observations  []model.MemoryObservation  `json:"observations"`
	MentalModels  []model.MemoryMentalModel  `json:"mental_models"`
}

// RecallMemory searches a memory bank for facts, observations and mental
// models matching the query.
func RecallMemory(req MemoryRecallRequest) (*MemoryRecallResponse, error) {
	if !agentMemoryEnabled {
		return nil, fmt.Errorf("agent memory is disabled")
	}
	if req.BankId <= 0 {
		return nil, fmt.Errorf("invalid bank id")
	}
	if req.Limit <= 0 {
		req.Limit = 20
	}

	// Extract keywords from query.
	var keywords []string
	if req.Query != "" {
		_, _, keywords = heuristicExtract(req.Query, req.Language)
	}

	filter := model.MemoryRecallFilter{
		BankId:    req.BankId,
		Entities:  req.Entities,
		Keywords:  keywords,
		Language:  req.Language,
		Since:     req.Since,
		Until:     req.Until,
		Limit:     req.Limit,
		Offset:    0,
	}

	facts, err := model.RecallMemoryFacts(filter)
	if err != nil {
		return nil, err
	}

	observations, err := model.RecallBankActiveObservations(filter)
	if err != nil {
		return nil, err
	}

	// Mental models: simple keyword match on source_query/tags.
	var mentalModels []model.MemoryMentalModel
	if req.Query != "" {
		q := "%" + strings.ToLower(req.Query) + "%"
		if err := model.DB.Where("bank_id = ? AND (LOWER(source_query) LIKE ? OR LOWER(tags) LIKE ?)",
			req.BankId, q, q).Limit(req.Limit).Find(&mentalModels).Error; err != nil {
			return nil, err
		}
	}

	return &MemoryRecallResponse{
		Facts:         facts,
		Observations:  observations,
		MentalModels:  mentalModels,
	}, nil
}

// --- Reflect ---

// MemoryReflectRequest is the input for reflecting over memories.
type MemoryReflectRequest struct {
	BankId   int64   `json:"bank_id"`
	Question string  `json:"question"`
	Context  string  `json:"context"`
	Language string  `json:"language"`
}

// MemoryReflectResponse is the result of a reflect operation.
type MemoryReflectResponse struct {
	Answer      string   `json:"answer"`
	FactsUsed   int      `json:"facts_used"`
	FactIds     []int64  `json:"fact_ids"`
}

// ReflectMemory reasons over memories in a bank to answer a question.
// It recalls relevant facts, then (if LLM callback is configured) asks the
// LLM to synthesize an answer grounded in those facts.
func ReflectMemory(req MemoryReflectRequest) (*MemoryReflectResponse, error) {
	if !agentMemoryEnabled {
		return nil, fmt.Errorf("agent memory is disabled")
	}
	if req.BankId <= 0 || req.Question == "" {
		return nil, fmt.Errorf("invalid reflect request")
	}

	// Recall relevant facts.
	recallReq := MemoryRecallRequest{
		BankId:   req.BankId,
		Query:    req.Question,
		Language: req.Language,
		Limit:    10,
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

	var answer string
	if agentMemoryLLMCall != nil && len(factTexts) > 0 {
		systemPrompt := `You are a memory reasoning assistant. Answer the user's question using ONLY the provided facts from their memory bank. Do not invent information. If the facts are insufficient, say so. Cite facts by their content. Answer in the same language as the question.`
		userPrompt := fmt.Sprintf("Question: %s\n\nContext: %s\n\nRelevant facts:\n%s", req.Question, req.Context, strings.Join(factTexts, "\n- "))
		llmResp, err := agentMemoryLLMCall(context.Background(), systemPrompt, userPrompt)
		if err == nil {
			answer = llmResp
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
		Answer:    answer,
		FactsUsed: len(factTexts),
		FactIds:   factIds,
	}, nil
}

// --- Consolidation ---

// ConsolidateMemory runs observation consolidation for a bank: it groups
// recent facts into observations and creates/refreshes mental models.
func ConsolidateMemory(bankId int64) error {
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

	// Build a summary observation.
	var sb strings.Builder
	entities := make(map[string]bool)
	keywords := make(map[string]bool)
	for _, f := range facts {
		sb.WriteString("- " + f.Content + "\n")
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

	var entityList, keywordList []string
	for e := range entities {
		entityList = append(entityList, e)
	}
	for k := range keywords {
		keywordList = append(keywordList, k)
	}

	summary := sb.String()
	if len(summary) > 2000 {
		summary = summary[:2000]
	}

	confidence := 0.5 + float64(len(facts))*0.05
	if confidence > 1.0 {
		confidence = 1.0
	}

	err = model.CreateMemoryObservation(
		bankId,
		summary,
		strings.Join(entityList, ","),
		strings.Join(keywordList, " "),
		len(facts),
		since,
		now,
		confidence,
	)
	if err != nil {
		return err
	}

	return nil
}
