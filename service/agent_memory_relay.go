package service

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
)

// ensureUserMemoryBank finds or creates a global memory bank for the given user.
func ensureUserMemoryBank(userId int) (int64, error) {
	banks, err := ListMemoryBanks(userId, "")
	if err != nil {
		return 0, err
	}
	if len(banks) > 0 {
		return banks[0].Id, nil
	}
	bank, err := CreateMemoryBank(userId, "", fmt.Sprintf("user-%d memory", userId), "Auto-created memory bank for user")
	if err != nil {
		return 0, err
	}
	return bank.Id, nil
}

// extractTextFromMessage extracts plain text from a dto.Message content.
func extractTextFromMessage(msg dto.Message) string {
	if msg.IsStringContent() {
		return msg.StringContent()
	}
	var sb strings.Builder
	for _, c := range msg.ParseContent() {
		if c.Type == dto.ContentTypeText && c.Text != "" {
			sb.WriteString(c.Text)
			sb.WriteString("\n")
		}
	}
	return strings.TrimSpace(sb.String())
}

// extractUserTextsFromRequest extracts all user message texts from a chat request.
func extractUserTextsFromRequest(req any) string {
	chatReq, ok := req.(*dto.GeneralOpenAIRequest)
	if !ok {
		return ""
	}
	var parts []string
	for _, msg := range chatReq.Messages {
		if msg.Role == "user" || msg.Role == "system" {
			text := extractTextFromMessage(msg)
			if text != "" {
				parts = append(parts, text)
			}
		}
	}
	return strings.Join(parts, "\n")
}

// extractAssistantTextsFromResponse extracts assistant message text from a
// non-stream OpenAI-compatible response body.
func extractAssistantTextsFromResponse(body []byte) string {
	if len(body) == 0 {
		return ""
	}
	var raw map[string]any
	if err := json.Unmarshal(body, &raw); err != nil {
		return ""
	}
	choices, ok := raw["choices"].([]any)
	if !ok || len(choices) == 0 {
		return ""
	}
	var parts []string
	for _, ch := range choices {
		choice, ok := ch.(map[string]any)
		if !ok {
			continue
		}
		msg, ok := choice["message"].(map[string]any)
		if !ok {
			continue
		}
		role, _ := msg["role"].(string)
		if role != "assistant" {
			continue
		}
		content, _ := msg["content"].(string)
		if content != "" {
			parts = append(parts, content)
		}
	}
	return strings.Join(parts, "\n")
}

// AutoRetainAfterResponse extracts facts from a completed chat request/response
// and stores them in the user's memory bank. Safe to call when agent memory is
// disabled (no-op).
func AutoRetainAfterResponse(userId int, request any, responseBody []byte) {
	if !AgentMemoryEnabled() {
		return
	}
	if userId <= 0 {
		return
	}

	bankId, err := ensureUserMemoryBank(userId)
	if err != nil {
		common.SysLog(common.LogText("agent memory: failed to ensure bank for user %d: %s", userId, err.Error()))
		return
	}

	// Retain user messages from the request.
	userText := extractUserTextsFromRequest(request)
	if userText != "" {
		_, err := RetainMemory(MemoryRetainRequest{
			Items: []MemoryRetainItem{{
				Content: Content{String: userText},
				Metadata: map[string]string{"bank_id": fmt.Sprintf("%d", bankId)},
				Tags:     []string{fmt.Sprintf("bank:%d", bankId), "user", "chat"},
			}},
		})
		if err != nil {
			common.SysLog(common.LogText("agent memory: retain user text failed: %s", err.Error()))
		}
	}

	// Retain assistant messages from the response.
	assistantText := extractAssistantTextsFromResponse(responseBody)
	if assistantText != "" {
		_, err := RetainMemory(MemoryRetainRequest{
			Items: []MemoryRetainItem{{
				Content: Content{String: assistantText},
				Metadata: map[string]string{"bank_id": fmt.Sprintf("%d", bankId)},
				Tags:     []string{fmt.Sprintf("bank:%d", bankId), "assistant", "chat"},
			}},
		})
		if err != nil {
			common.SysLog(common.LogText("agent memory: retain assistant text failed: %s", err.Error()))
		}
	}
}

// AutoRecallBeforeRequest loads relevant memories for the user and returns a
// system prompt snippet to prepend to the request. Returns "" when no relevant
// memories are found or agent memory is disabled.
func AutoRecallBeforeRequest(userId int, queryText string) string {
	if !AgentMemoryEnabled() {
		return ""
	}
	if userId <= 0 || queryText == "" {
		return ""
	}

	bankId, err := ensureUserMemoryBank(userId)
	if err != nil {
		common.SysLog(common.LogText("agent memory: failed to ensure bank for user %d: %s", userId, err.Error()))
		return ""
	}

	recallResp, err := RecallMemory(MemoryRecallRequest{
		BankId: bankId,
		Query:  queryText,
		Budget: &Budget{MaxFacts: 5, MaxObservations: 5},
		Types:  []string{"fact", "observation"},
	})
	if err != nil {
		common.SysLog(common.LogText("agent memory: recall failed: %s", err.Error()))
		return ""
	}

	var parts []string
	for _, f := range recallResp.Facts {
		if f.Content != "" {
			parts = append(parts, "- "+f.Content)
		}
	}
	for _, o := range recallResp.Observations {
		if o.Summary != "" {
			parts = append(parts, "- [observation] "+o.Summary)
		}
	}
	if len(parts) == 0 {
		return ""
	}

	return "You have access to the following memories from previous conversations with this user:\n" +
		strings.Join(parts, "\n") +
		"\n\nUse them when relevant to answer the user's question. Do not mention that you are using memory unless asked."
}

// InjectRecallIntoRequest prepends the recall snippet to the first system
// message, or inserts a new system message at the front if none exists.
func InjectRecallIntoRequest(req any, snippet string) {
	if snippet == "" {
		return
	}
	chatReq, ok := req.(*dto.GeneralOpenAIRequest)
	if !ok {
		return
	}
	// Find first system message without tools.
	for i, msg := range chatReq.Messages {
		if msg.Role == "system" && len(msg.Tools) == 0 {
			existing := extractTextFromMessage(msg)
			chatReq.Messages[i].SetStringContent(snippet + "\n\n---\n\n" + existing)
			return
		}
	}
	// No system message — insert one at the front.
	chatReq.Messages = append([]dto.Message{
		{Role: "system", Content: snippet},
	}, chatReq.Messages...)
}