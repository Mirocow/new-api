/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import {
  CHANNEL_TYPES,
  CHANNEL_TYPE_VLLM,
  CHANNEL_TYPE_SGLANG,
  CHANNEL_TYPE_GROQ,
  CHANNEL_TYPE_CEREBRAS,
  CHANNEL_TYPE_FIREWORKS,
  CHANNEL_TYPE_DEEPINFRA,
  CHANNEL_TYPE_TOGETHER,
  CHANNEL_TYPE_HUGGINGFACE,
  CHANNEL_TYPE_AZURE_OPENAI,
  CHANNEL_TYPE_GOOGLE_AI,
  CHANNEL_TYPE_AI21,
  CHANNEL_TYPE_ANYSCALE,
  CHANNEL_TYPE_MISTRAL_AI,
  CHANNEL_TYPE_DASHSCOPE,
  CHANNEL_TYPE_REQUESTY,
} from '../constants'

// ============================================================================
// Channel Type Configuration
// ============================================================================

export interface ChannelTypeConfig {
  id: number
  name: string
  icon: string
  requiresOrganization?: boolean
  requiresRegion?: boolean
  supportedModels?: string[]
  hints?: {
    baseUrl?: string
    key?: string
    models?: string
    other?: string
  }
  validation?: {
    keyFormat?: RegExp
    keyMinLength?: number
  }
}

/**
 * Configuration for each channel type
 */
export const CHANNEL_TYPE_CONFIGS: Record<number, ChannelTypeConfig> = {
  [CHANNEL_TYPE_SGLANG]: {
    id: CHANNEL_TYPE_SGLANG,
    name: CHANNEL_TYPES[CHANNEL_TYPE_SGLANG],
    icon: 'SGLang',
    hints: {
      baseUrl: 'SGLang server address, without /v1',
      key: 'SGLang API key, or EMPTY if authentication is disabled',
      models: 'Models fetched from upstream /v1/models',
    },
  },
  [CHANNEL_TYPE_VLLM]: {
    id: CHANNEL_TYPE_VLLM,
    name: CHANNEL_TYPES[CHANNEL_TYPE_VLLM],
    icon: 'Vllm',
    hints: {
      baseUrl: 'vLLM server address, without /v1',
      key: 'vLLM API key, or EMPTY if authentication is disabled',
      models: 'Models fetched from upstream /v1/models',
    },
  },
  1: {
    id: 1,
    name: CHANNEL_TYPES[1],
    icon: 'openai',
    requiresOrganization: true,
    hints: {
      key: 'Format: sk-...',
      models: 'gpt-4,gpt-4-turbo,gpt-3.5-turbo',
    },
    validation: {
      keyFormat: /^sk-/,
      keyMinLength: 20,
    },
  },
  3: {
    id: 3,
    name: CHANNEL_TYPES[3],
    icon: 'azure',
    requiresRegion: true,
    hints: {
      baseUrl: 'Azure OpenAI Endpoint',
      key: 'Azure API Key',
      models: 'Deployment names',
    },
  },
  14: {
    id: 14,
    name: CHANNEL_TYPES[14],
    icon: 'anthropic',
    hints: {
      key: 'Format: sk-ant-...',
      models: 'claude-3-opus,claude-3-sonnet,claude-3-haiku',
    },
  },
  24: {
    id: 24,
    name: CHANNEL_TYPES[24],
    icon: 'google',
    hints: {
      key: 'Google API Key',
      models: 'gemini-pro,gemini-pro-vision',
    },
  },
  41: {
    id: 41,
    name: CHANNEL_TYPES[41],
    icon: 'google',
    requiresRegion: true,
    hints: {
      key: 'Service account JSON or API key',
      models: 'gemini-pro,gemini-1.5-pro',
      other: 'Region config: {"default": "us-central1"}',
    },
  },
  43: {
    id: 43,
    name: CHANNEL_TYPES[43],
    icon: 'deepseek',
    hints: {
      key: 'DeepSeek API Key',
      models: 'deepseek-chat,deepseek-coder',
    },
  },
  20: {
    id: 20,
    name: CHANNEL_TYPES[20],
    icon: 'openrouter',
    hints: {
      key: 'OpenRouter API Key',
      models: 'Use model IDs from OpenRouter',
    },
  },
  56: {
    id: 56,
    name: CHANNEL_TYPES[56],
    icon: 'replicate',
    hints: {
      key: 'Replicate API Token',
      models: 'Replicate model IDs',
    },
  },
  58: {
    id: 58,
    name: CHANNEL_TYPES[58],
    icon: 'newapi',
    hints: {
      baseUrl: 'Fallback base URL',
      key: 'Used by route auth templates',
      models: 'Models exposed by this channel',
    },
  },
  59: {
    id: 59,
    name: CHANNEL_TYPES[59],
    icon: 'Sub2API',
    hints: {
      baseUrl: 'Sub2API gateway base URL',
      key: 'Sub2API API Key',
      models: 'Models fetched from upstream /v1/models',
    },
  },
  60: {
    id: 60,
    name: CHANNEL_TYPES[60],
    icon: 'NewAPI',
    hints: {
      baseUrl: 'Base URL is required for this channel type',
      key: 'Enter API key for this channel',
      models: 'Models',
    },
  },
  [CHANNEL_TYPE_GROQ]: {
    id: CHANNEL_TYPE_GROQ,
    name: CHANNEL_TYPES[CHANNEL_TYPE_GROQ],
    icon: 'Groq',
    hints: {
      baseUrl: 'https://api.groq.com',
      key: 'Groq API Key',
      models: 'llama-3.3-70b-versatile,llama-3.1-70b-versatile,mixtral-8x7b-32768',
    },
  },
  [CHANNEL_TYPE_CEREBRAS]: {
    id: CHANNEL_TYPE_CEREBRAS,
    name: CHANNEL_TYPES[CHANNEL_TYPE_CEREBRAS],
    icon: 'Cerebras',
    hints: {
      baseUrl: 'https://api.cerebras.ai',
      key: 'Cerebras API Key',
      models: 'llama3.1-70b,llama3.1-8b',
    },
  },
  [CHANNEL_TYPE_FIREWORKS]: {
    id: CHANNEL_TYPE_FIREWORKS,
    name: CHANNEL_TYPES[CHANNEL_TYPE_FIREWORKS],
    icon: 'Fireworks',
    hints: {
      baseUrl: 'https://api.fireworks.ai',
      key: 'Fireworks API Key',
      models: 'accounts/fireworks/models/llama-v3p1-70b-instruct,accounts/fireworks/models/mixtral-8x7b-instruct',
    },
  },
  [CHANNEL_TYPE_DEEPINFRA]: {
    id: CHANNEL_TYPE_DEEPINFRA,
    name: CHANNEL_TYPES[CHANNEL_TYPE_DEEPINFRA],
    icon: 'DeepInfra',
    hints: {
      baseUrl: 'https://api.deepinfra.com',
      key: 'DeepInfra API Key',
      models: 'meta-llama/Meta-Llama-3.1-70B-Instruct,mistralai/Mixtral-8x7B-Instruct-v0.1',
    },
  },
  [CHANNEL_TYPE_TOGETHER]: {
    id: CHANNEL_TYPE_TOGETHER,
    name: CHANNEL_TYPES[CHANNEL_TYPE_TOGETHER],
    icon: 'Together',
    hints: {
      baseUrl: 'https://api.together.xyz',
      key: 'Together API Key',
      models: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo,mistralai/Mixtral-8x7B-Instruct-v0.1',
    },
  },
  [CHANNEL_TYPE_HUGGINGFACE]: {
    id: CHANNEL_TYPE_HUGGINGFACE,
    name: CHANNEL_TYPES[CHANNEL_TYPE_HUGGINGFACE],
    icon: 'HuggingFace',
    hints: {
      baseUrl: 'https://api-inference.huggingface.co',
      key: 'Hugging Face API Token',
      models: 'meta-llama/Meta-Llama-3.1-70B-Instruct,mistralai/Mixtral-8x7B-Instruct-v0.1',
    },
  },
  [CHANNEL_TYPE_AZURE_OPENAI]: {
    id: CHANNEL_TYPE_AZURE_OPENAI,
    name: CHANNEL_TYPES[CHANNEL_TYPE_AZURE_OPENAI],
    icon: 'azure',
    requiresRegion: true,
    hints: {
      baseUrl: 'Azure OpenAI Endpoint (e.g., https://your-resource.openai.azure.com)',
      key: 'Azure API Key',
      models: 'Deployment names (gpt-4o,gpt-4o-mini,etc.)',
    },
  },
  [CHANNEL_TYPE_GOOGLE_AI]: {
    id: CHANNEL_TYPE_GOOGLE_AI,
    name: CHANNEL_TYPES[CHANNEL_TYPE_GOOGLE_AI],
    icon: 'google',
    hints: {
      baseUrl: 'https://generativelanguage.googleapis.com',
      key: 'Google AI API Key',
      models: 'gemini-1.5-pro,gemini-1.5-flash,gemini-2.0-flash-exp',
    },
  },
  [CHANNEL_TYPE_AI21]: {
    id: CHANNEL_TYPE_AI21,
    name: CHANNEL_TYPES[CHANNEL_TYPE_AI21],
    icon: 'Ai21',
    hints: {
      baseUrl: 'https://api.ai21.com',
      key: 'AI21 API Key',
      models: 'jamba-1.5-large,jamba-1.5-mini',
    },
  },
  [CHANNEL_TYPE_ANYSCALE]: {
    id: CHANNEL_TYPE_ANYSCALE,
    name: CHANNEL_TYPES[CHANNEL_TYPE_ANYSCALE],
    icon: 'Anyscale',
    hints: {
      baseUrl: 'https://api.anyscale.com',
      key: 'Anyscale API Key',
      models: 'meta-llama/Meta-Llama-3.1-70B-Instruct,mistralai/Mixtral-8x7B-Instruct-v0.1',
    },
  },
  [CHANNEL_TYPE_MISTRAL_AI]: {
    id: CHANNEL_TYPE_MISTRAL_AI,
    name: CHANNEL_TYPES[CHANNEL_TYPE_MISTRAL_AI],
    icon: 'Mistral',
    hints: {
      baseUrl: 'https://api.mistral.ai',
      key: 'Mistral API Key',
      models: 'mistral-large-latest,mistral-small-latest,codestral-latest',
    },
  },
  [CHANNEL_TYPE_DASHSCOPE]: {
    id: CHANNEL_TYPE_DASHSCOPE,
    name: CHANNEL_TYPES[CHANNEL_TYPE_DASHSCOPE],
    icon: 'DashScope',
    hints: {
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      key: 'DashScope API Key',
      models: 'qwen-max,qwen-plus,qwen-turbo,qwen2.5-72b-instruct',
    },
  },
  [CHANNEL_TYPE_REQUESTY]: {
    id: CHANNEL_TYPE_REQUESTY,
    name: CHANNEL_TYPES[CHANNEL_TYPE_REQUESTY],
    icon: 'Requesty',
    hints: {
      baseUrl: 'https://router.requesty.ai/v1',
      key: 'Requesty API Key',
      models: 'requesty-default,requesty-cheap,requesty-fast,requesty-smart',
    },
  },
}

/**
 * Get configuration for a channel type
 */
export function getChannelTypeConfig(type: number): ChannelTypeConfig {
  return (
    CHANNEL_TYPE_CONFIGS[type] || {
      id: type,
      name: CHANNEL_TYPES[type as keyof typeof CHANNEL_TYPES] || 'Unknown',
      icon: 'openai',
    }
  )
}

/**
 * Check if channel type requires organization field
 */
export function requiresOrganization(type: number): boolean {
  return CHANNEL_TYPE_CONFIGS[type]?.requiresOrganization || false
}

/**
 * Check if channel type requires region configuration
 */
export function requiresRegion(type: number): boolean {
  return CHANNEL_TYPE_CONFIGS[type]?.requiresRegion || false
}

/**
 * Get hints for channel type
 */
export function getChannelTypeHints(type: number) {
  return CHANNEL_TYPE_CONFIGS[type]?.hints || {}
}

/**
 * Validate API key format for channel type
 */
export function validateKeyFormat(type: number, key: string): boolean {
  const config = CHANNEL_TYPE_CONFIGS[type]
  if (!config?.validation) return true

  const { keyFormat, keyMinLength } = config.validation

  if (keyMinLength && key.length < keyMinLength) {
    return false
  }

  if (keyFormat && !keyFormat.test(key)) {
    return false
  }

  return true
}
