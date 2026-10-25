package dto

// UpstreamModelInfo represents a model with its metadata from upstream provider
// This is a unified structure that can hold metadata from different providers
// (OpenAI-compatible, Ollama, Gemini, etc.)
type UpstreamModelInfo struct {
	ID                  string         `json:"id"`
	Object              string         `json:"object,omitempty"`
	Created             int64          `json:"created,omitempty"`
	OwnedBy             string         `json:"owned_by,omitempty"`
	Description         string         `json:"description,omitempty"`
	DisplayName         string         `json:"display_name,omitempty"`
	MaxInputTokens      int            `json:"max_input_tokens,omitempty"`
	MaxOutputTokens     int            `json:"max_output_tokens,omitempty"`
	SupportedMethods    []string       `json:"supported_methods,omitempty"`
	Metadata            map[string]any `json:"metadata,omitempty"`
	ProviderSpecific    map[string]any `json:"provider_specific,omitempty"`
	Size                int64          `json:"size,omitempty"`
	Digest              string         `json:"digest,omitempty"`
	ModifiedAt          string         `json:"modified_at,omitempty"`
	Details             *ModelDetails  `json:"details,omitempty"`
}

type ModelDetails struct {
	ParentModel       string   `json:"parent_model,omitempty"`
	Format            string   `json:"format,omitempty"`
	Family            string   `json:"family,omitempty"`
	Families          []string `json:"families,omitempty"`
	ParameterSize     string   `json:"parameter_size,omitempty"`
	QuantizationLevel string   `json:"quantization_level,omitempty"`
}