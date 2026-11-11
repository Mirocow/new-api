package service

import (
	"context"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/providermemory"
)

// ConfigureProviderMemory initializes the provider memory subsystem with the
// given parameters. Must be called once at startup before
// StartProviderMemoryConsolidationLoop.
func ConfigureProviderMemory(enable bool, consolidateEverySec int, retentionHours int, minFacts int64) {
	providermemory.Configure(enable, consolidateEverySec, retentionHours, minFacts)
}

// StartProviderMemoryConsolidationLoop launches the background consolidation
// goroutine. It runs until the process exits or the returned context is
// cancelled. Call after ConfigureProviderMemory.
func StartProviderMemoryConsolidationLoop() {
	// The providermemory package uses a simple stop channel; we create one
	// that lives for the process lifetime. If graceful shutdown is needed
	// later, we can wire it to the main context.
	stop := make(chan struct{})
	providermemory.StartConsolidationLoop(stop)
	// Keep reference to prevent GC of the channel (not strictly needed here).
	_ = stop
}

// ProviderMemoryEnabled reports whether the provider memory system is active.
func ProviderMemoryEnabled() bool {
	return providermemory.Enabled()
}

// RetainProviderFact is a convenience wrapper for callers outside the
// providermemory package (e.g., from text_quota.go).
func RetainProviderFact(in providermemory.FactInput) error {
	return providermemory.RetainFact(in)
}

// BestChannelByLatency returns the cached "best latency" mental model ranking
// for a model, or nil if not available.
func BestChannelByLatency(modelName string) (*providermemory.RoutingHint, error) {
	return providermemory.BestChannelByLatency(modelName)
}

// BestChannelBySuccess returns the cached "best success rate" mental model
// ranking for a model, or nil if not available.
func BestChannelBySuccess(modelName string) (*providermemory.RoutingHint, error) {
	return providermemory.BestChannelBySuccess(modelName)
}

// RecallProviderFacts returns raw facts matching the filter.
func RecallProviderFacts(f providermemory.RecallFilter) ([]Fact, error) {
	facts, err := providermemory.RecallFacts(f)
	if err != nil {
		return nil, err
	}
	out := make([]Fact, len(facts))
	for i, f := range facts {
		out[i] = Fact(f)
	}
	return out, nil
}

// RecallProviderObservations returns the latest active observations matching the filter.
func RecallProviderObservations(f providermemory.RecallFilter) ([]Observation, error) {
	obs, err := providermemory.RecallObservations(f)
	if err != nil {
		return nil, err
	}
	out := make([]Observation, len(obs))
	for i, o := range obs {
		out[i] = Observation(o)
	}
	return out, nil
}

// --- Re-export types for external callers ---

type FactInput = providermemory.FactInput
type RecallFilter = providermemory.RecallFilter
type RoutingHint = providermemory.RoutingHint
type Ranking = providermemory.Ranking

// Fact is a re-export of the internal fact type for external inspection.
type Fact = model.ProviderMemoryFact

// Observation is a re-export of the internal observation type.
type Observation = model.ProviderObservation

// MentalModel is a re-export for admin/debug endpoints.
type MentalModel struct {
	Id           int64
	SourceQuery  string
	ScopeModel   string
	Content      string
	Payload      string
	Tags         string
	AutoRefresh  bool
	RefreshedAt  int64
	CreatedAt    int64
}

// GetProviderMentalModel returns the cached mental model for a scope.
func GetProviderMentalModel(sourceQuery, scopeModel string) (*MentalModel, error) {
	mm, err := model.GetProviderMentalModel(sourceQuery, scopeModel)
	if err != nil {
		return nil, err
	}
	return &MentalModel{
		Id:          mm.Id,
		SourceQuery: mm.SourceQuery,
		ScopeModel:  mm.ScopeModel,
		Content:     mm.Content,
		Payload:     mm.Payload,
		Tags:        mm.Tags,
		AutoRefresh: mm.AutoRefresh,
		RefreshedAt: mm.RefreshedAt,
		CreatedAt:   mm.CreatedAt,
	}, nil
}

// ListAutoRefreshMentalModels returns all mental models flagged for auto-refresh.
func ListAutoRefreshMentalModels() ([]MentalModel, error) {
	mms, err := model.ListAutoRefreshMentalModels()
	if err != nil {
		return nil, err
	}
	out := make([]MentalModel, len(mms))
	for i, mm := range mms {
		out[i] = MentalModel{
			Id:          mm.Id,
			SourceQuery: mm.SourceQuery,
			ScopeModel:  mm.ScopeModel,
			Content:     mm.Content,
			Payload:     mm.Payload,
			Tags:        mm.Tags,
			AutoRefresh: mm.AutoRefresh,
			RefreshedAt: mm.RefreshedAt,
			CreatedAt:   mm.CreatedAt,
		}
	}
	return out, nil
}

// UpsertProviderMentalModel creates or replaces a mental model.
func UpsertProviderMentalModel(sourceQuery, scopeModel, content, payload, tags string, autoRefresh bool) error {
	return model.UpsertProviderMentalModel(sourceQuery, scopeModel, content, payload, tags, autoRefresh)
}

// ConsolidateProviderFacts runs one consolidation pass manually (e.g., from
// an admin endpoint or test). Returns the number of observations produced.
func ConsolidateProviderFacts() (int, error) {
	return providermemory.ConsolidateFacts()
}

// PruneOldProviderFacts deletes facts older than `before` (unix seconds).
func PruneOldProviderFacts(before int64) (int64, error) {
	return model.PruneOldFacts(before)
}

// StartProviderMemoryConsolidationLoopWithContext is a variant that respects
// a context for graceful shutdown.
func StartProviderMemoryConsolidationLoopWithContext(ctx context.Context) {
	stop := make(chan struct{})
	go func() {
		<-ctx.Done()
		close(stop)
	}()
	providermemory.StartConsolidationLoop(stop)
}

// ModelSuitability is a re-export of the providermemory ModelSuitability type.
type ModelSuitability = providermemory.ModelSuitability

// GetModelSuitability returns suitability and preference info for a model
// and source query. Used by the admin UI to show hints when creating/editing
// mental models.
func GetModelSuitability(sourceQuery, scopeModel string) (*ModelSuitability, error) {
	return providermemory.GetModelSuitability(sourceQuery, scopeModel)
}

// GetBulkModelSuitability returns suitability info for all models that have
// at least one fact, for a given source query. Used by the admin UI to show
// suitability badges in the model dropdown.
func GetBulkModelSuitability(sourceQuery string) (map[string]*ModelSuitability, error) {
	return providermemory.GetBulkModelSuitability(sourceQuery)
}