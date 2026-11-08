package operation_setting

import "github.com/QuantumNous/new-api/setting/config"

// defaultAgentMemoryChannelId is unset (0) by default — the operator must
// explicitly choose a channel for internal LLM calls (Retain/Reflect).
const defaultAgentMemoryRetentionDays = 30
const defaultAgentMemoryMaxFactsPerBank = 10000
const defaultAgentMemoryConsolidateEverySec = 3600

type AgentMemorySetting struct {
	Enabled              bool   `json:"enabled"`
	ChannelId            int    `json:"channel_id"`
	ModelName            string `json:"model_name"`
	MaxFactsPerBank      int    `json:"max_facts_per_bank"`
	RetentionDays        int    `json:"retention_days"`
	ConsolidateEverySec  int    `json:"consolidate_every_sec"`
}

var agentMemorySetting = AgentMemorySetting{
	Enabled:           false,
	ChannelId:         0,
	ModelName:         "",
	MaxFactsPerBank:   defaultAgentMemoryMaxFactsPerBank,
	RetentionDays:     defaultAgentMemoryRetentionDays,
	ConsolidateEverySec: defaultAgentMemoryConsolidateEverySec,
}

func GetAgentMemorySetting() *AgentMemorySetting {
	return &agentMemorySetting
}

func init() {
	config.GlobalConfig.Register("agent_memory_setting", &agentMemorySetting)
}
