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

type ModelProvider = {
  readonly name: string
  readonly icon: string
  readonly label?: string
}

type ModelProviderRule = ModelProvider & {
  keywords?: readonly string[]
  pattern?: RegExp
  fallbackKeywords?: readonly string[]
  fallbackPattern?: RegExp
}

// Provider prefixes that should take precedence (hosted models)
// These are checked FIRST before stripping prefixes
const HOSTED_PROVIDER_PREFIXES: readonly (readonly [string, string])[] = [
  ['nvidia/', 'NVIDIA'],
  ['perplexity/', 'Perplexity'],
  ['azure/', 'OpenAI'], // Azure OpenAI
  ['aws/', 'Amazon'], // AWS Bedrock
  ['gcp/', 'Gemini'], // Google Cloud Vertex AI
  ['cloudflare/', 'Cloudflare'],
  ['cohere/', 'Cohere'],
  ['ai21/', 'AI21 Labs'],
  ['mistralai/', 'Mistral'],
  ['stabilityai/', 'Stability AI'],
  ['nousresearch/', 'Nous Research'],
  ['midjourney/', 'Midjourney'],
  ['kling/', 'Kling'],
  ['vidu/', 'Vidu'],
  ['suno/', 'Suno'],
  ['jimeng/', 'Jimeng'],
  ['01-ai/', 'Yi'],
  ['zhipu/', 'Zhipu'],
  ['baidu/', 'Baidu'],
  ['iflytek/', 'iFlytek'],
  ['tencent/', 'Tencent'],
  ['baichuan/', 'Baichuan'],
  ['internlm/', 'InternLM'],
  ['stepfun/', 'StepFun'],
  ['minimax/', 'MiniMax'],
  ['doubao/', 'Doubao'],
  ['moonshot/', 'Moonshot'],
  ['qwen/', 'Qwen'],
  ['deepseek/', 'DeepSeek'],
  ['yi/', 'Yi'],
  ['x-ai/', 'xAI'],
  ['xai/', 'xAI'],
  ['zai-org/', 'Zhipu'],
  ['thudm/', 'Zhipu'],
  ['clef/', 'Cloudflare'],
  ['black-forest-labs/', 'Black Forest Labs'],
  ['jinaai/', 'Jina'],
  ['baai/', 'BAAI'],
  // Additional inference platforms
  ['replicate/', 'Replicate'],
  ['together/', 'Together AI'],
  ['fireworks/', 'Fireworks AI'],
  ['deepinfra/', 'DeepInfra'],
  ['anyscale/', 'Anyscale'],
  ['huggingface/', 'Hugging Face'],
  ['groq/', 'Groq'],
  ['cerebras/', 'Cerebras'],
  ['sambanova/', 'SambaNova'],
  ['nebius/', 'Nebius'],
  ['lambda/', 'Lambda Labs'],
  ['octoai/', 'OctoAI'],
  ['predibase/', 'Predibase'],
  ['monsterapi/', 'Monster API'],
  ['novita/', 'Novita AI'],
  ['inference/', 'Inference.net'],
  ['workers-ai/', 'Workers AI'],
  ['github/', 'GitHub Models'],
  ['azure-ai/', 'Azure AI'],
  ['vertex-ai/', 'Vertex AI'],
  ['siliconflow/', 'SiliconFlow'],
  ['dashscope/', 'DashScope'],
  ['ali/', 'DashScope'],
  ['sagemaker/', 'SageMaker'],
  ['triton/', 'Triton'],
  ['requesty/', 'Requesty'],
  ['cursor/', 'Cursor'],
] as const

// Common provider prefixes to strip from model names before matching
// (used when no hosted provider prefix matches)
const PROVIDER_PREFIXES = [
  'openai/',
  'anthropic/',
  'google/',
  'meta-llama/',
  'microsoft/',
  'amazon/',
  'cohere/',
  'ai21/',
  'stabilityai/',
  'nousresearch/',
  'midjourney/',
  'kling/',
  'vidu/',
  'suno/',
  'jimeng/',
  '01-ai/',
  'zhipu/',
  'baidu/',
  'iflytek/',
  'tencent/',
  'baichuan/',
  'internlm/',
  'stepfun/',
  'minimax/',
  'doubao/',
  'moonshot/',
  'qwen/',
  'deepseek/',
  'yi/',
  'nvidia/',
  'perplexity/',
  'x-ai/',
  'xai/',
  'zai-org/',
  'thudm/',
  'clef/',
  'black-forest-labs/',
  'jinaai/',
  'baai/',
  // Additional inference platforms
  'replicate/',
  'together/',
  'fireworks/',
  'deepinfra/',
  'anyscale/',
  'huggingface/',
  'groq/',
  'cerebras/',
  'sambanova/',
  'nebius/',
  'lambda/',
  'octoai/',
  'predibase/',
  'monsterapi/',
  'novita/',
  'inference/',
  'workers-ai/',
  'github/',
  'azure-ai/',
  'vertex-ai/',
  'siliconflow/',
  'dashscope/',
  'ali/',
  'sagemaker/',
  'triton/',
  'requesty/',
  'cursor/',
] as const

function normalizeModelNameForMatching(modelName: string): string {
  let normalized = modelName.trim().toLowerCase()
  // Strip known provider prefixes
  for (const prefix of PROVIDER_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length)
      break
    }
  }
  // Remove version suffixes like :latest, :v1, -v1, etc.
  normalized = normalized.replace(/:.*$/, '')
  normalized = normalized.replace(/[-_]v\d+$/, '')
  return normalized
}

// Match specific providers before overlapping model families: 360gpt before
// GPT, and Perplexity's Sonar / NVIDIA's Nemotron before Llama or Mixtral.
const MODEL_PROVIDER_RULES: readonly ModelProviderRule[] = [
  { name: '360 AI', icon: 'Ai360.Color', keywords: ['360gpt', '360zhinao'] },
  {
    name: 'Perplexity',
    icon: 'Perplexity.Color',
    keywords: ['perplexity', 'sonar-', 'sonar.'],
  },
  {
    name: 'NVIDIA',
    icon: 'Nvidia.Color',
    keywords: [
      'nvidia/',
      'nvidia.',
      'nemotron',
      'nv-embed',
      'nv-rerank',
      'riva-',
      'parakeet-',
      'canary-',
      'nemoretriever',
    ],
  },
  {
    name: 'Cloudflare',
    icon: 'Cloudflare.Color',
    keywords: ['clef', '@cf/'],
  },
  {
    name: 'OpenAI',
    icon: 'OpenAI.Color',
    fallbackKeywords: [
      'text-embedding-',
      'omni-moderation',
      'dall-e',
      'whisper',
      'tts-',
    ],
    fallbackPattern: /\bo[134](?:-|$)/,
    keywords: [
      'openai/',
      'openai.',
      'gpt-',
      'chatgpt-',
      'codex-',
      'dall-e-',
      'whisper-',
      'omni-moderation-',
      'text-moderation-',
      'text-embedding-ada-',
      'text-embedding-3-',
      'text-ada-',
      'text-babbage-',
      'text-curie-',
      'davinci-',
      'babbage-',
      'computer-use-preview',
      'sora',
      'o1-',
      'o3-',
      'o4-',
    ],
    pattern: /(?:^|[/.:])(?:o(?:1|3|4)(?=$|[-.:])|tts-)/,
  },
  {
    name: 'Anthropic',
    icon: 'Claude.Color',
    label: 'Claude',
    keywords: ['anthropic', 'claude'],
  },
  {
    name: 'Gemini',
    icon: 'Gemini.Color',
    keywords: [
      'gemini',
      'gemma',
      'learnlm',
      'imagen',
      'veo',
      'nano-banana',
      'palm-',
      'aqa',
    ],
    pattern: /(?:^|[/.:])aqa$/,
  },
  {
    name: 'xAI',
    icon: 'Grok.Color',
    label: 'Grok',
    keywords: ['x-ai/', 'xai/', 'xai-', 'grok'],
  },
  { name: 'DeepSeek', icon: 'DeepSeek.Color', keywords: ['deepseek'] },
  {
    name: 'Qwen',
    icon: 'Qwen.Color',
    keywords: ['qwen', 'qwq-', 'qvq-', 'tongyi', 'gte-'],
    pattern: /(?:^|[/.:])(?:text-embedding-v\d+|gui-plus|z-image)(?:$|[-_.:])/,
  },
  { name: 'Wan', icon: 'Wan', pattern: /(?:^|[/.:])wan(?:x?\d|[-_])/ },
  { name: 'Moonshot', icon: 'Moonshot.Color', keywords: ['moonshot', 'kimi-'] },
  {
    name: 'MiniMax',
    icon: 'Minimax.Color',
    keywords: ['minimax', 'abab', 'hailuo'],
    pattern: /^(?:t2v|i2v|s2v)-01(?:-|$)/,
  },
  {
    name: 'Doubao',
    icon: 'Doubao.Color',
    keywords: ['doubao', 'volcengine', 'seedance', 'seedream', 'seed-1-'],
  },
  {
    name: 'Zhipu',
    icon: 'Zhipu.Color',
    fallbackKeywords: ['glm-'],
    keywords: ['zhipu', 'zai-org', 'thudm', 'chatglm', 'cogview', 'cogvideo'],
    pattern: /(?:^|[/._-])glm(?=$|[-._])/,
  },
  {
    name: 'Baidu',
    icon: 'Wenxin.Color',
    keywords: ['baidu', 'wenxin', 'ernie'],
  },
  {
    name: 'Yi',
    icon: 'Yi.Color',
    fallbackKeywords: ['yi-'],
    keywords: ['01-ai/', 'yi-'],
    pattern: /(?:^|[/.:])yi(?=$|[-_])/,
  },
  {
    name: 'iFlytek',
    icon: 'Spark.Color',
    label: 'iFlyTek',
    fallbackKeywords: ['spark'],
    keywords: ['iflytek', 'sparkdesk'],
  },
  {
    name: 'Tencent',
    icon: 'Hunyuan.Color',
    keywords: ['tencent', 'hunyuan'],
    pattern: /(?:^|[/.:])hy\d*(?=$|[-_.:])/,
  },
  { name: 'Baichuan', icon: 'Baichuan.Color', keywords: ['baichuan'] },
  { name: 'InternLM', icon: 'InternLM.Color', keywords: ['internlm'] },
  { name: 'StepFun', icon: 'Stepfun.Color', keywords: ['stepfun', 'step-'] },
  { name: 'MiMo', icon: 'XiaomiMiMo', keywords: ['xiaomi', 'mimo-'] },
  {
    name: 'Mistral',
    icon: 'Mistral.Color',
    keywords: [
      'mistral',
      'mixtral',
      'codestral',
      'ministral',
      'pixtral',
      'magistral',
    ],
  },
  {
    name: 'Meta',
    icon: 'Meta.Color',
    fallbackKeywords: ['meta-'],
    keywords: ['meta-llama', 'meta/', 'muse-', 'llama-', 'llama2', 'llama3', 'llama4'],
  },
  {
    name: 'Cohere',
    icon: 'Cohere.Color',
    keywords: ['cohere', 'command-', 'c4ai-aya', 'aya-'],
    pattern: /(?:^|[/.:])command$/,
  },
  { name: 'Jina', icon: 'Jina', keywords: ['jinaai', 'jina-'] },
  { name: 'BAAI', icon: 'BAAI', keywords: ['baai/', 'bge-'] },
  {
    name: 'Black Forest Labs',
    icon: 'Bfl',
    keywords: ['black-forest-labs', 'flux.'],
  },
  {
    name: 'Microsoft',
    icon: 'Microsoft.Color',
    keywords: ['microsoft/', 'phi-', 'wizardlm', 'orca-'],
    pattern: /(?:^|[/.:])phi(?=$|[-._])/,
  },
  {
    name: 'Amazon',
    icon: 'Aws.Color',
    keywords: ['amazon/', 'amazon.', 'nova-', 'titan-'],
  },
  { name: 'AI21 Labs', icon: 'Ai21', keywords: ['ai21', 'jamba'] },
  {
    name: 'Stability AI',
    icon: 'Stability.Color',
    keywords: ['stabilityai', 'stable-diffusion', 'stable-image', 'sdxl-', 'sd3-', 'cosxl'],
  },
  {
    name: 'Nous Research',
    icon: 'NousResearch',
    keywords: ['nousresearch', 'hermes-', 'nemotron-3-ultra'],
  },
  {
    name: 'Midjourney',
    icon: 'Midjourney',
    keywords: ['midjourney', 'mj_', 'mj-', 'swap_face'],
  },
  { name: 'Kling', icon: 'Kling.Color', keywords: ['kling'] },
  { name: 'Vidu', icon: 'Vidu.Color', keywords: ['vidu'] },
  { name: 'Suno', icon: 'Suno', keywords: ['suno'] },
  { name: 'Jimeng', icon: 'Jimeng.Color', keywords: ['jimeng'] },
  // Additional inference platforms
  {
    name: 'Replicate',
    icon: 'Replicate',
    keywords: ['replicate/'],
  },
  {
    name: 'Together AI',
    icon: 'Together',
    keywords: ['together/'],
  },
  {
    name: 'Fireworks AI',
    icon: 'Fireworks',
    keywords: ['fireworks/'],
  },
  {
    name: 'DeepInfra',
    icon: 'DeepInfra',
    keywords: ['deepinfra/'],
  },
  {
    name: 'Anyscale',
    icon: 'Anyscale',
    keywords: ['anyscale/'],
  },
  {
    name: 'Hugging Face',
    icon: 'HuggingFace',
    keywords: ['huggingface/'],
  },
  {
    name: 'Groq',
    icon: 'Groq',
    keywords: ['groq/'],
  },
  {
    name: 'Cerebras',
    icon: 'Cerebras',
    keywords: ['cerebras/'],
  },
  {
    name: 'SambaNova',
    icon: 'SambaNova',
    keywords: ['sambanova/'],
  },
  {
    name: 'Nebius',
    icon: 'Nebius',
    keywords: ['nebius/'],
  },
  {
    name: 'Lambda Labs',
    icon: 'Lambda',
    keywords: ['lambda/'],
  },
  {
    name: 'OctoAI',
    icon: 'OctoAI',
    keywords: ['octoai/'],
  },
  {
    name: 'Predibase',
    icon: 'Predibase',
    keywords: ['predibase/'],
  },
  {
    name: 'Monster API',
    icon: 'MonsterAPI',
    keywords: ['monsterapi/'],
  },
  {
    name: 'Novita AI',
    icon: 'Novita',
    keywords: ['novita/'],
  },
  {
    name: 'Inference.net',
    icon: 'InferenceNet',
    keywords: ['inference/'],
  },
  {
    name: 'Workers AI',
    icon: 'Cloudflare.Color',
    keywords: ['workers-ai/'],
  },
  {
    name: 'GitHub Models',
    icon: 'GitHub',
    keywords: ['github/'],
  },
  {
    name: 'Azure AI',
    icon: 'Azure.Color',
    keywords: ['azure-ai/'],
  },
  {
    name: 'Vertex AI',
    icon: 'VertexAI.Color',
    keywords: ['vertex-ai/'],
  },
  {
    name: 'SiliconFlow',
    icon: 'SiliconFlow',
    keywords: ['siliconflow/'],
  },
  {
    name: 'DashScope',
    icon: 'DashScope.Color',
    keywords: ['dashscope/', 'ali/'],
  },
  {
    name: 'SageMaker',
    icon: 'Aws.Color',
    keywords: ['sagemaker/'],
  },
  {
    name: 'Triton',
    icon: 'Nvidia.Color',
    keywords: ['triton/'],
  },
  {
    name: 'Requesty',
    icon: 'RiRouterLine',
    keywords: ['requesty/'],
  },
  {
    name: 'Cursor',
    icon: 'RiCursorLine',
    keywords: ['cursor/'],
  },
]

export function resolveModelProvider(modelName: string): ModelProvider | null {
  const model = modelName.trim().toLowerCase()

  // First, check for hosted provider prefixes (these take precedence)
  for (const [prefix, providerName] of HOSTED_PROVIDER_PREFIXES) {
    if (model.startsWith(prefix)) {
      const provider = MODEL_PROVIDER_RULES.find((rule) => rule.name === providerName)
      if (provider) {
        return provider
      }
    }
  }

  // Then normalize and match by model name
  const normalized = normalizeModelNameForMatching(modelName)

  // The broader log aliases are fallbacks so text-embedding-v3 stays Qwen
  // and step-tts-mini stays StepFun instead of matching OpenAI first.
  return (
    MODEL_PROVIDER_RULES.find(
      (rule) =>
        rule.keywords?.some((keyword) => normalized.includes(keyword)) ||
        rule.pattern?.test(normalized)
    ) ??
    MODEL_PROVIDER_RULES.find(
      (rule) =>
        rule.fallbackKeywords?.some((keyword) => normalized.includes(keyword)) ||
        rule.fallbackPattern?.test(normalized)
    ) ?? null
  )
}