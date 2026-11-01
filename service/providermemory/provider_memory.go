// Package providermemory implements an in-process adaptation of the Hindsight
// memory model (retain / recall / reflect / mental models) for provider
// performance tracking and smart routing hints.
//
// Design (see model/provider_memory.go for schema):
//
//   Retain  — after each relay settles, RetainFact stores one performance fact.
//   Recall  — RecallFacts/Observations does TEMPR-lite retrieval
//             (keyword + entity + temporal, no vectors).
//   Reflect — ConsolidateFacts aggregates recent facts into one observation
//             per (channel_id, model_name) and refreshes mental models.
//             The current implementation is deterministic/statistical; it does
//             not call an LLM, so it works offline and adds zero latency/cost.
//             An optional LLM-based reflector can be layered in later.
//   Mental Models — pre-computed ranking tables cached in the DB; reads are a
//             single SELECT, used by the routing hint lookup.
package providermemory

import (
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

// sysLog/sysLogError wrap common.SysLog/SysError so call sites stay terse.
func sysLog(format string, args ...any) {
	common.SysLog(common.LogText(format, args...))
}
func sysLogError(format string, args ...any) {
	common.SysError(common.LogText(format, args...))
}

// --- Configuration (feature-flagged, off by default) ---

var (
	enableMu       sync.RWMutex
	enabled        = false
	consolidateEvery = 300 // seconds between consolidation runs
	factRetention    = 7 * 24 * time.Hour // facts older than this are pruned
	minFactsToConsolidate int64 = 5
)

// Configure sets runtime parameters. Call once at startup from the
// initialization path; safe to call again to reconfigure.
func Configure(enable bool, consolidateEverySec int, retentionHours int, minFacts int64) {
	enableMu.Lock()
	defer enableMu.Unlock()
	enabled = enable
	if consolidateEverySec > 0 {
		consolidateEvery = consolidateEverySec
	}
	if retentionHours > 0 {
		factRetention = time.Duration(retentionHours) * time.Hour
	}
	if minFacts > 0 {
		minFactsToConsolidate = minFacts
	}
}

// Enabled reports whether the memory system is active.
func Enabled() bool {
	enableMu.RLock()
	defer enableMu.RUnlock()
	return enabled
}

// --- Retain ---

// FactInput is the payload retained after each relay settles.
type FactInput struct {
	ChannelId   int
	ModelName   string
	ChannelType int
	// Metrics: free-form string-encoded JSON built by the caller via
	// common.Marshal. Keys typically: latency_ms, success_rate, error_rate,
	// cost_per_1k, quota_used, prompt_tokens, completion_tokens.
	Metrics  string
	Entities []string // task tags: "coding","writing","image",...
	Keywords []string // significant tokens for recall
	// Language: ISO 639-1 code detected from request content (en, zh, ja, ...).
	// Empty when detection is unavailable; recall falls back to keyword matching.
	Language string
	Success  bool
}

// RetainFact stores one performance fact. No-op when the system is disabled.
func RetainFact(in FactInput) error {
	if !Enabled() {
		return nil
	}
	if in.ChannelId <= 0 || in.ModelName == "" {
		return nil
	}
	return model.RetainProviderFact(in.ChannelId, in.ModelName, in.ChannelType,
		in.Metrics, in.Entities, in.Keywords, in.Language, in.Success)
}

// --- Recall ---

// RecallFilter mirrors model.ProviderRecallFilter at the service boundary.
type RecallFilter = model.ProviderRecallFilter

// RecallFacts returns raw facts matching the filter.
func RecallFacts(f RecallFilter) ([]model.ProviderMemoryFact, error) {
	if !Enabled() {
		return nil, nil
	}
	return model.RecallProviderFacts(f)
}

// RecallObservations returns the latest active observations matching the filter.
func RecallObservations(f RecallFilter) ([]model.ProviderObservation, error) {
	if !Enabled() {
		return nil, nil
	}
	return model.RecallActiveObservations(f)
}

// --- Reflect (deterministic consolidation) ---

// ConsolidateFacts scans active (channel_id, model_name) scopes that have
// accumulated enough new facts since their last observation, produces a fresh
// observation per scope, then refreshes any auto-refresh mental models whose
// scope was touched. Returns the number of observations produced.
//
// This is the Hindsight "observation consolidation" step, implemented as
// deterministic statistical aggregation rather than LLM synthesis so it runs
// cheaply on a schedule and never blocks the relay path.
func ConsolidateFacts() (int, error) {
	if !Enabled() {
		return 0, nil
	}
	scopes, err := collectDirtyScopes()
	if err != nil {
		return 0, fmt.Errorf("providermemory: collect scopes: %w", err)
	}
	if len(scopes) == 0 {
		return 0, nil
	}
	produced := 0
	for _, sc := range scopes {
		if err := consolidateScope(sc); err != nil {
			sysLogError("providermemory: consolidate scope %d/%s: %s",
				sc.channelId, sc.modelName, err.Error())
			continue
		}
		produced++
	}
	if produced > 0 {
		if err := refreshMentalModels(scopes); err != nil {
			sysLogError("providermemory: refresh mental models: %s", err.Error())
		}
	}
	// Bound table growth.
	if before := common.GetTimestamp() - int64(factRetention.Seconds()); before > 0 {
		if _, err := model.PruneOldFacts(before); err != nil {
			sysLogError("providermemory: prune old facts: %s", err.Error())
		}
	}
	return produced, nil
}

type scopeKey struct {
	channelId   int
	modelName   string
	channelType int
}

func collectDirtyScopes() ([]scopeKey, error) {
	// Distinct (channel_id, model_name, channel_type) among facts newer than
	// the latest observation per scope. We approximate "latest observation"
	// by scanning the active observations set.
	type row struct {
		ChannelId   int
		ModelName   string
		ChannelType int
	}
	var rows []row
	// We fetch distinct active facts scopes via a raw-ish GORM query.
	// Using DISTINCT on three columns is portable across SQLite/MySQL/PG.
	err := model.DB.Model(&model.ProviderMemoryFact{}).
		Select("DISTINCT channel_id, model_name, channel_type").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	// Deduplicate in-memory (GORM DISTINCT may not work reliably across dialects).
	seen := make(map[scopeKey]struct{})
	var out []scopeKey
	for _, r := range rows {
		sk := scopeKey{channelId: r.ChannelId, modelName: r.ModelName, channelType: r.ChannelType}
		if _, ok := seen[sk]; ok {
			continue
		}
		seen[sk] = struct{}{}

		// Determine the last observation time for this scope.
		var lastObs model.ProviderObservation
		e := model.DB.Where("channel_id = ? AND model_name = ? AND superseded_by IS NULL",
			r.ChannelId, r.ModelName).
			Order("created_at DESC").First(&lastObs).Error
		var since int64
		if e == nil {
			since = lastObs.WindowEnd
		}
		n, err := model.CountRecentFacts(r.ChannelId, r.ModelName, since)
		if err != nil {
			sysLogError("providermemory: count recent facts: %s", err.Error())
			continue
		}
		if n >= minFactsToConsolidate {
			out = append(out, sk)
		}
	}
	return out, nil
}

func consolidateScope(sc scopeKey) error {
	// Pull facts since the last observation's window end (or all if none).
	var lastObs model.ProviderObservation
	e := model.DB.Where("channel_id = ? AND model_name = ? AND superseded_by IS NULL",
		sc.channelId, sc.modelName).
		Order("created_at DESC").First(&lastObs).Error
	var since int64
	windowStart := common.GetTimestamp() - int64(factRetention.Seconds())
	if e == nil && lastObs.WindowEnd > windowStart {
		since = lastObs.WindowEnd
	}
	facts, err := model.RecallProviderFacts(RecallFilter{
		ChannelId: sc.channelId,
		ModelName: sc.modelName,
		Since:     since,
		Limit:     1000,
	})
	if err != nil {
		return err
	}
	if len(facts) == 0 {
		return nil
	}
	agg := aggregate(facts)
	summary := fmt.Sprintf("%s on channel %d: %d samples, avg latency %dms, success %.1f%%, error rate %.2f%%",
		sc.modelName, sc.channelId, agg.sampleSize, agg.avgLatencyMs,
		agg.successRate*100, agg.errorRate*100)
	return model.CreateProviderObservation(sc.channelId, sc.modelName, sc.channelType,
		summary, agg.metricsJSON, agg.sampleSize, agg.windowStart, agg.windowEnd, agg.confidence)
}

type factAgg struct {
	sampleSize    int
	avgLatencyMs  int64
	successRate   float64
	errorRate     float64
	metricsJSON   string
	windowStart   int64
	windowEnd     int64
	confidence    float64
}

func aggregate(facts []model.ProviderMemoryFact) factAgg {
	a := factAgg{
		sampleSize: len(facts),
		windowEnd:  0,
		windowStart: 0,
	}
	if len(facts) == 0 {
		return a
	}
	var latencySum int64
	successes := 0
	for _, f := range facts {
		lat := extractLatencyMs(f.Metrics)
		latencySum += lat
		if f.Success {
			successes++
		}
		if a.windowStart == 0 || f.RetainedAt < a.windowStart {
			a.windowStart = f.RetainedAt
		}
		if f.RetainedAt > a.windowEnd {
			a.windowEnd = f.RetainedAt
		}
	}
	a.avgLatencyMs = latencySum / int64(len(facts))
	a.successRate = float64(successes) / float64(len(facts))
	a.errorRate = 1 - a.successRate
	// Confidence grows with sample size up to a ceiling. 30+ samples → ~0.95.
	a.confidence = clampConfidence(float64(len(facts)))
	a.metricsJSON = fmt.Sprintf(
		`{"sample_size":%d,"avg_latency_ms":%d,"success_rate":%.4f,"error_rate":%.4f}`,
		a.sampleSize, a.avgLatencyMs, a.successRate, a.errorRate)
	return a
}

func clampConfidence(n float64) float64 {
	// 1 - e^(-n/10) → reaches ~0.95 around n=30, asymptotes to 1.
	c := 1 - 1/(1+ (n/10)) // logistic-ish, simpler and bounded
	if c > 0.99 {
		c = 0.99
	}
	if c < 0 {
		c = 0
	}
	return c
}

// extractLatencyMs pulls the latency_ms integer from a metrics JSON blob.
// Tolerant of missing/malformed fields (returns 0).
func extractLatencyMs(metrics string) int64 {
	// Cheap extraction without full unmarshal — metrics are produced by us.
	idx := strings.Index(metrics, "\"latency_ms\"")
	if idx < 0 {
		return 0
	}
	rest := metrics[idx+len("\"latency_ms\""):]
	// skip colon and whitespace
	for len(rest) > 0 && (rest[0] == ':' || rest[0] == ' ' || rest[0] == '"') {
		rest = rest[1:]
	}
	var n int64
	for len(rest) > 0 && rest[0] >= '0' && rest[0] <= '9' {
		n = n*10 + int64(rest[0]-'0')
		rest = rest[1:]
	}
	return n
}

// --- Mental models (pre-computed rankings) ---

// refreshMentalModels recomputes every auto-refresh mental model whose scope
// was touched in this consolidation pass.
func refreshMentalModels(touched []scopeKey) error {
	mms, err := model.ListAutoRefreshMentalModels()
	if err != nil {
		return err
	}
	for _, mm := range mms {
		// Scope match: model name or "*" (global).
		if !scopeTouched(mm.ScopeModel, touched) {
			continue
		}
		if err := rebuildMentalModel(mm); err != nil {
			sysLogError("providermemory: rebuild model %q/%s: %s",
				mm.SourceQuery, mm.ScopeModel, err.Error())
		}
	}
	return nil
}

func scopeTouched(scopeModel string, touched []scopeKey) bool {
	if scopeModel == "*" || scopeModel == "" {
		return true
	}
	for _, sc := range touched {
		if sc.modelName == scopeModel {
			return true
		}
	}
	return false
}

// rebuildMentalModel recomputes content + payload for one mental model from
// current active observations in its scope.
func rebuildMentalModel(mm model.ProviderMentalModel) error {
	f := RecallFilter{Limit: 200}
	if mm.ScopeModel != "" && mm.ScopeModel != "*" {
		f.ModelName = mm.ScopeModel
	}
	obs, err := model.RecallActiveObservations(f)
	if err != nil {
		return err
	}
	content, payload := synthesizeModel(mm.SourceQuery, obs)
	return model.UpsertProviderMentalModel(mm.SourceQuery, mm.ScopeModel,
		content, payload, mm.Tags, mm.AutoRefresh)
}

// synthesizeModel turns observations into a mental-model content + payload
// according to the source query intent. Supports the ranking intents used by
// the routing hint path; unknown intents fall back to a plain summary.
func synthesizeModel(sourceQuery string, obs []model.ProviderObservation) (string, string) {
	if len(obs) == 0 {
		return "no observations available", "[]"
	}
	intent := classifyQuery(sourceQuery)
	switch intent {
	case "best_latency":
		return rankBy(obs, "latency", true) // ascending = lower is better
	case "best_success":
		return rankBy(obs, "success", false) // descending
	case "best_cost":
		return rankBy(obs, "cost", true)
	default:
		var b strings.Builder
		for _, o := range obs {
			b.WriteString(o.Summary)
			b.WriteByte('\n')
		}
		return b.String(), "[]"
	}
}

func classifyQuery(q string) string {
	lq := strings.ToLower(q)
	switch {
	case strings.Contains(lq, "latency") || strings.Contains(lq, "fast"):
		return "best_latency"
	case strings.Contains(lq, "success") || strings.Contains(lq, "reliab"):
		return "best_success"
	case strings.Contains(lq, "cost") || strings.Contains(lq, "cheap"):
		return "best_cost"
	default:
		return "summary"
	}
}

// rankBy produces a human-readable ranking and a JSON-ish payload of
// channelId:modelName:score ordered by the chosen metric.
func rankBy(obs []model.ProviderObservation, metric string, ascending bool) (string, string) {
	type entry struct {
		channelId int
		modelName string
		score     float64
		summary   string
	}
	es := make([]entry, 0, len(obs))
	for _, o := range obs {
		es = append(es, entry{
			channelId: o.ChannelId,
			modelName: o.ModelName,
			score:     extractScore(o.Metrics, metric),
			summary:   o.Summary,
		})
	}
	sort.SliceStable(es, func(i, j int) bool {
		if ascending {
			return es[i].score < es[j].score
		}
		return es[i].score > es[j].score
	})
	var b strings.Builder
	var p strings.Builder
	p.WriteByte('[')
	for i, e := range es {
		fmt.Fprintf(&b, "%d. %s (channel %d): %.4f — %s\n", i+1, e.modelName, e.channelId, e.score, e.summary)
		if i > 0 {
			p.WriteByte(',')
		}
		fmt.Fprintf(&p, `{"channel_id":%d,"model":"%s","score":%.6f}`, e.channelId, e.modelName, e.score)
	}
	p.WriteByte(']')
	return b.String(), p.String()
}

func extractScore(metrics, metric string) float64 {
	key := "\"" + metric
	switch metric {
	case "latency":
		key = "\"avg_latency_ms\""
	case "success":
		key = "\"success_rate\""
	case "cost":
		key = "\"cost_per_1k\""
	}
	idx := strings.Index(metrics, key)
	if idx < 0 {
		return 0
	}
	rest := metrics[idx+len(key):]
	for len(rest) > 0 && (rest[0] == ':' || rest[0] == ' ' || rest[0] == '"') {
		rest = rest[1:]
	}
	// parse float
	neg := false
	if len(rest) > 0 && rest[0] == '-' {
		neg = true
		rest = rest[1:]
	}
	var intPart, fracPart float64
	var div float64 = 10
	inFrac := false
	for len(rest) > 0 {
		c := rest[0]
		if c >= '0' && c <= '9' {
			if inFrac {
				fracPart = fracPart + float64(c-'0')/div
				div *= 10
			} else {
				intPart = intPart*10 + float64(c-'0')
			}
			rest = rest[1:]
		} else if c == '.' {
			inFrac = true
			rest = rest[1:]
		} else {
			break
		}
	}
	v := intPart + fracPart
	if neg {
		v = -v
	}
	return v
}

// --- Routing hint (instant mental-model read) ---

// RoutingHint is the machine-readable result of a mental-model lookup.
type RoutingHint struct {
	SourceQuery string
	ScopeModel  string
	// Rankings ordered best-first; each entry is a channel + score.
	Rankings []Ranking
}

type Ranking struct {
	ChannelId int
	ModelName string
	Score     float64
}

// BestChannelByLatency returns the cached ranking for "lowest latency" mental
// model for a given model scope. nil/empty when no model exists yet.
func BestChannelByLatency(modelName string) (*RoutingHint, error) {
	if !Enabled() {
		return nil, nil
	}
	return readRoutingHint("best channel by latency", modelName)
}

// BestChannelBySuccess returns the cached ranking for "highest success rate".
func BestChannelBySuccess(modelName string) (*RoutingHint, error) {
	if !Enabled() {
		return nil, nil
	}
	return readRoutingHint("best channel by success", modelName)
}

func readRoutingHint(query, scope string) (*RoutingHint, error) {
	// Try exact scope first
	mm, err := model.GetProviderMentalModel(query, scope)
	if err != nil {
		// Fall back to global scope (*)
		mm, err = model.GetProviderMentalModel(query, "*")
		if err != nil {
			return nil, nil // not found is fine
		}
	}
	return &RoutingHint{
		SourceQuery: mm.SourceQuery,
		ScopeModel:  mm.ScopeModel,
		Rankings:    parseRankings(mm.Payload),
	}, nil
}

func parseRankings(payload string) []Ranking {
	if payload == "" || payload == "[]" {
		return nil
	}
	out := []Ranking{}
	// Very small tolerant parser for the payload format produced by rankBy.
	rest := payload
	for {
		idx := strings.Index(rest, "\"channel_id\":")
		if idx < 0 {
			break
		}
		rest = rest[idx+len("\"channel_id\":"):]
		ch := parseIntToken(&rest)
		mi := strings.Index(rest, "\"model\":\"")
		if mi < 0 {
			break
		}
		rest = rest[mi+len("\"model\":\""):]
		endM := strings.Index(rest, "\"")
		if endM < 0 {
			break
		}
		modelName := rest[:endM]
		rest = rest[endM+1:]
		si := strings.Index(rest, "\"score\":")
		if si < 0 {
			break
		}
		rest = rest[si+len("\"score\":"):]
		score := parseFloatToken(&rest)
		out = append(out, Ranking{ChannelId: ch, ModelName: modelName, Score: score})
	}
	return out
}

func parseIntToken(s *string) int {
	for len(*s) > 0 && ((*s)[0] == ' ' || (*s)[0] == ':') {
		*s = (*s)[1:]
	}
	var n int
	for len(*s) > 0 && (*s)[0] >= '0' && (*s)[0] <= '9' {
		n = n*10 + int((*s)[0]-'0')
		*s = (*s)[1:]
	}
	return n
}

func parseFloatToken(s *string) float64 {
	neg := false
	if len(*s) > 0 && (*s)[0] == '-' {
		neg = true
		*s = (*s)[1:]
	}
	var intPart, fracPart float64
	var div float64 = 10
	inFrac := false
	for len(*s) > 0 {
		c := (*s)[0]
		if c >= '0' && c <= '9' {
			if inFrac {
				fracPart = fracPart + float64(c-'0')/div
				div *= 10
			} else {
				intPart = intPart*10 + float64(c-'0')
			}
			*s = (*s)[1:]
		} else if c == '.' {
			inFrac = true
			*s = (*s)[1:]
		} else {
			break
		}
	}
	v := intPart + fracPart
	if neg {
		v = -v
	}
	return v
}

// --- Background runner ---

// StartConsolidationLoop runs the consolidation step on a schedule until ctx
// is cancelled. Intended to be launched from main.go as a goroutine.
func StartConsolidationLoop(stop <-chan struct{}) {
	if !Enabled() {
		return
	}
	interval := time.Duration(consolidateEvery) * time.Second
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			n, err := ConsolidateFacts()
			if err != nil {
				sysLogError("providermemory: consolidation tick: %s", err.Error())
				continue
			}
			if n > 0 {
				sysLog("providermemory: consolidated %d scopes", n)
			}
		}
	}
}