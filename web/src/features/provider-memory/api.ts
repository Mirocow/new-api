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