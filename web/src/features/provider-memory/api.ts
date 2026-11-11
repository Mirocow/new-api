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
import { api } from '@/lib/api'
import { getChannelTypeLabel } from '@/features/channels/lib/channel-utils'
import { extractMappingSourceModels } from '@/features/channels/lib/model-mapping-validation'
import type { GetChannelsResponse } from '@/features/channels/types'

export interface ProviderMemoryConfig {
  enabled: boolean
  consolidate_interval_s: number
  retention_hours: number
  min_facts: number
}

export interface ProviderMemoryStats {
  facts_total: number
  observations_active: number
  mental_models_total: number
  distinct_scopes: number
  enabled: boolean
}

export interface ProviderMemoryFact {
  id: number
  channel_id: number
  model_name: string
  channel_type: number
  metrics: string
  entities: string
  keywords: string
  language: string
  success: boolean
  retained_at: number
  created_at: number
}

export interface ProviderObservation {
  id: number
  channel_id: number
  model_name: string
  channel_type: number
  summary: string
  metrics: string
  sample_size: number
  window_start: number
  window_end: number
  superseded_by: number | null
  confidence: number
  created_at: number
}

export interface ProviderMentalModel {
  id: number
  source_query: string
  scope_model: string
  content: string
  payload: string
  tags: string
  auto_refresh: boolean
  refreshed_at: number
  created_at: number
}

export interface RoutingHint {
  SourceQuery: string
  ScopeModel: string
  Rankings: Array<{
    ChannelId: number
    ModelName: string
    Score: number
  }>
}

export interface ConsolidateResponse {
  message: string
  observations_added: number
}

export interface PruneResponse {
  message: string
  rows_deleted: number
}

export async function getProviderMemoryConfig() {
  const res = await api.get<ProviderMemoryConfig>(
    '/api/provider-memory/config'
  )
  return res.data
}

export async function updateProviderMemoryConfig(
  config: Partial<ProviderMemoryConfig>
) {
  const res = await api.put<ProviderMemoryConfig>(
    '/api/provider-memory/config',
    config
  )
  return res.data
}

export async function getProviderMemoryStats() {
  const res = await api.get<ProviderMemoryStats>('/api/provider-memory/stats')
  return res.data
}

export async function listProviderMemoryFacts(params?: {
  page?: number
  page_size?: number
  channel_id?: number
  model_name?: string
  channel_type?: number
}) {
  const res = await api.get<{ data: ProviderMemoryFact[]; total: number }>(
    '/api/provider-memory/facts',
    { params }
  )
  return res.data
}

export async function listProviderObservations(params?: {
  page?: number
  page_size?: number
  channel_id?: number
  model_name?: string
  channel_type?: number
}) {
  const res = await api.get<{ data: ProviderObservation[]; total: number }>(
    '/api/provider-memory/observations',
    { params }
  )
  return res.data
}

export async function listProviderMentalModels() {
  const res = await api.get<{ data: ProviderMentalModel[] }>(
    '/api/provider-memory/mental-models'
  )
  return res.data
}

export async function upsertProviderMentalModel(data: {
  source_query: string
  scope_model: string
  content?: string
  payload?: string
  tags?: string
  auto_refresh?: boolean
}) {
  const res = await api.post<{ message: string }>(
    '/api/provider-memory/mental-model',
    data
  )
  return res.data
}

export async function deleteProviderMentalModel(
  sourceQuery: string,
  scopeModel: string
) {
  const res = await api.delete<{ message: string }>(
    '/api/provider-memory/mental-model',
    { params: { source_query: sourceQuery, scope_model: scopeModel } }
  )
  return res.data
}

export async function consolidateProviderFacts() {
  const res = await api.post<ConsolidateResponse>(
    '/api/provider-memory/consolidate'
  )
  return res.data
}

export async function pruneOldProviderFacts(before: number) {
  const res = await api.post<PruneResponse>('/api/provider-memory/prune', null, {
    params: { before },
  })
  return res.data
}

export async function getRoutingHintByLatency(model: string) {
  const res = await api.get<RoutingHint | { message: string }>(
    '/api/provider-memory/routing-hint/latency',
    { params: { model } }
  )
  return res.data
}

export async function getRoutingHintBySuccess(model: string) {
  const res = await api.get<RoutingHint | { message: string }>(
    '/api/provider-memory/routing-hint/success',
    { params: { model } }
  )
  return res.data
}

// ============================================================================
// Channel & Model helpers for Mental Model creation
// ============================================================================

export interface ProviderOption {
  /** Channel type id (the provider family, e.g. 1 = OpenAI) */
  value: number
  /** i18n key of the provider label; call t() before rendering */
  label: string
  /** Number of enabled channels of this type */
  channelCount: number
}

export interface ModelOption {
  value: string
  label: string
  /** Provider (channel type) this model belongs to */
  channelType: number
  /** True when the name comes from model_mapping (an alias users request) */
  isAlias: boolean
}

/**
 * Build provider + model suggestions for mental model scope selection.
 *
 * Providers are the channel types of all ENABLED channels; models are the
 * union of each channel's `models` list and its `model_mapping` keys (the
 * aliases users actually request). Models are grouped by provider so the form
 * can render two dependent autocomplete inputs.
 *
 * The channel API caps `page_size` at 100, so the list is fetched page by page.
 * If no channel data is readable, the static provider→model catalog from
 * `/api/models` is used so the pickers are never empty.
 */
export async function getChannelsForMentalModel(): Promise<{
  providers: ProviderOption[]
  models: ModelOption[]
}> {
  const providerMap = new Map<number, ProviderOption>()
  const modelMap = new Map<string, ModelOption>()

  function addProvider(type: number) {
    const existing = providerMap.get(type)
    if (existing) {
      existing.channelCount += 1
    } else {
      providerMap.set(type, {
        value: type,
        label: getChannelTypeLabel(type),
        channelCount: 1,
      })
    }
  }

  function addModel(type: number, name: string, isAlias: boolean) {
    const trimmed = name.trim()
    if (!trimmed) return
    const key = `${type}:${trimmed}`
    if (modelMap.has(key)) return
    modelMap.set(key, {
      value: trimmed,
      label: trimmed,
      channelType: type,
      isAlias,
    })
  }

  // Accept string or number channel types and string or array model lists,
  // because the payload shape differs between versions and tag mode.
  function modelNames(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((v): v is string => typeof v === 'string')
    }
    if (typeof value === 'string') {
      return value.split(',').filter(Boolean)
    }
    return []
  }

  let fetchedAny = false
  let page = 1
  const pageSize = 100

  for (;;) {
    const res = await api.get<GetChannelsResponse>('/api/channel', {
      params: { status: 'enabled', p: page, page_size: pageSize },
    })
    const items = res.data.data?.items ?? []
    for (const ch of items) {
      const type = Number(ch.type)
      if (!Number.isFinite(type)) continue
      fetchedAny = true
      addProvider(type)
      for (const model of modelNames(ch.models)) addModel(type, model, false)
      for (const alias of extractMappingSourceModels(ch.model_mapping || '')) {
        addModel(type, alias, true)
      }
    }
    const total = res.data.data?.total ?? 0
    if (items.length < pageSize || page * pageSize >= total) break
    page += 1
    if (page > 50) break
  }

  // Fallback: static provider→model catalog served by /api/models
  if (!fetchedAny) {
    const catalog = await api.get<{ success: boolean; data?: Record<string, string[]> }>(
      '/api/models'
    )
    for (const [typeStr, models] of Object.entries(catalog.data.data ?? {})) {
      const type = Number(typeStr)
      if (!Number.isFinite(type)) continue
      addProvider(type)
      for (const model of modelNames(models)) addModel(type, model, false)
    }
  }

  return {
    providers: [...providerMap.values()].sort((a, b) =>
      a.label.localeCompare(b.label)
    ),
    models: [...modelMap.values()].sort((a, b) =>
      a.label.localeCompare(b.label)
    ),
  }
}

// ============================================================================
// Model Suitability (for mental model creation hints)
// ============================================================================

export interface ModelSuitability {
  source_query: string
  scope_model: string
  fact_count: number
  observation_count: number
  has_mental_model: boolean
  best_channel: RoutingHint | null
  suitability_level: 'none' | 'low' | 'medium' | 'high'
  explanation: string
}

export async function getModelSuitability(
  sourceQuery: string,
  scopeModel: string
): Promise<ModelSuitability> {
  const res = await api.get<ModelSuitability>(
    '/api/provider-memory/model-suitability',
    { params: { source_query: sourceQuery, scope_model: scopeModel } }
  )
  return res.data
}

export async function getBulkModelSuitability(
  sourceQuery: string
): Promise<Record<string, ModelSuitability>> {
  const res = await api.get<Record<string, ModelSuitability>>(
    '/api/provider-memory/model-suitability-bulk',
    { params: { source_query: sourceQuery } }
  )
  return res.data
}

