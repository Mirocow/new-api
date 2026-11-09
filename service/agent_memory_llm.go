package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

// agentMemoryLLMCaller implements the LLM callback for agent memory Retain/Reflect.
// It uses the configured channel (from AgentMemorySetting) to make OpenAI-compatible
// chat completion requests.
func agentMemoryLLMCaller(ctx context.Context, systemPrompt, userPrompt string) (string, error) {
	setting := operation_setting.GetAgentMemorySetting()
	if setting == nil || setting.ChannelId <= 0 {
		return "", fmt.Errorf("agent memory LLM channel not configured")
	}

	// Get channel configuration
	channel, err := model.GetChannelById(setting.ChannelId, true)
	if err != nil {
		return "", fmt.Errorf("failed to get memory LLM channel: %w", err)
	}
	if channel.Status != 1 {
		return "", fmt.Errorf("memory LLM channel is disabled")
	}

	maxTokens := uint(2048)
	temperature := float64(0.1)
	stream := false

	// Build request
	req := &dto.GeneralOpenAIRequest{
		Model:       setting.ModelName,
		Messages: []dto.Message{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt},
		},
		MaxTokens:   &maxTokens,
		Temperature: &temperature,
		Stream:      &stream,
	}

	// Marshal request
	jsonData, err := common.Marshal(req)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	// Determine base URL
	baseURL := ""
	if channel.BaseURL != nil && *channel.BaseURL != "" {
		baseURL = *channel.BaseURL
	} else {
		// Default to OpenAI-compatible endpoint
		baseURL = "https://api.openai.com/v1/chat/completions"
	}
	// Ensure it ends with /chat/completions
	if len(baseURL) > 0 && baseURL[len(baseURL)-1] != '/' {
		baseURL += "/"
	}
	if baseURL != "https://api.openai.com/v1/chat/completions" {
		baseURL += "chat/completions"
	}

	// Get API key
	key := channel.Key
	if key == "" {
		return "", fmt.Errorf("memory LLM channel has no API key")
	}

	// Create HTTP request
	httpReq, err := http.NewRequestWithContext(ctx, "POST", baseURL, bytes.NewReader(jsonData))
	if err != nil {
		return "", fmt.Errorf("failed to create HTTP request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+key)
	if channel.OpenAIOrganization != nil && *channel.OpenAIOrganization != "" {
		httpReq.Header.Set("OpenAI-Organization", *channel.OpenAIOrganization)
	}

	// Make request with timeout
	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("LLM API error (status %d): %s", resp.StatusCode, string(body))
	}

	// Parse response - use OpenAITextResponse for non-streaming
	var chatResp dto.OpenAITextResponse
	if err := json.Unmarshal(body, &chatResp); err != nil {
		return "", fmt.Errorf("failed to parse response: %w", err)
	}

	if len(chatResp.Choices) == 0 {
		return "", fmt.Errorf("empty response from LLM")
	}

	content := chatResp.Choices[0].Message.StringContent()
	if content == "" {
		return "", fmt.Errorf("empty content in LLM response")
	}

	return content, nil
}

// InitAgentMemoryLLM initializes the LLM callback for agent memory.
// Call this during application startup after settings are loaded.
func InitAgentMemoryLLM() {
	SetAgentMemoryLLMCall(agentMemoryLLMCaller)
}