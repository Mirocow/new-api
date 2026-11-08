/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see
<https://www.gnu.org/licenses/>.
*/
import { api } from '@/lib/api'

export interface MemoryBank {
  id: number
  user_id: number
  agent_id: string
  name: string
  description: string
  created_at: number
  updated_at: number
}

export interface CreateMemoryBankRequest {
  user_id: number
  agent_id?: string
  name: string
  description?: string
}

export interface UpdateMemoryBankRequest {
  name?: string
  description?: string
}

export interface MemoryFact {
  id: number
  bank_id: number
  content: string
  entities: string
  keywords: string
  language: string
  confidence: number
  retained_at: number
  created_at: number
}

export interface MemoryObservation {
  id: number
  bank_id: number
  summary: string
  entities: string
  keywords: string
  confidence: number
  sample_size: number
  window_start: number
  window_end: number
  superseded_by: number | null
  created_at: number
}

export interface MemoryMentalModel {
  id: number
  bank_id: number
  source_query: string
  scope_model: string
  content: string
  payload: string
  tags: string
  auto_refresh: boolean
  refreshed_at: number
  created_at: number
}

export interface KnowledgePage {
  id: number
  bank_id: number
  title: string
  content: string
  path: string
  parent_id: number | null
  updated_at: number
  created_at: number
}

export interface MemoryRetainRequest {
  bank_id: number
  text: string
  role?: string
  language?: string
}

export interface MemoryRetainResponse {
  facts_retained: number
}

export interface MemoryRecallRequest {
  bank_id: number
  query?: string
  entities?: string[]
  language?: string
  since?: number
  until?: number
  limit?: number
}

export interface MemoryRecallResponse {
  facts: MemoryFact[]
  observations: MemoryObservation[]
  mental_models: MemoryMentalModel[]
}

export interface MemoryReflectRequest {
  bank_id: number
  question: string
  context?: string
  language?: string
}

export interface MemoryReflectResponse {
  answer: string
  facts_used: number
  fact_ids: number[]
}

export async function listMemoryBanks(userId: number, agentId?: string) {
  const params: Record<string, string> = { user_id: String(userId) }
  if (agentId) {
    params.agent_id = agentId
  }
  const res = await api.get<{ success: boolean; message: string; data: MemoryBank[] }>(
    '/api/agent-memory/banks',
    { params }
  )
  return res.data.data
}

export async function createMemoryBank(request: CreateMemoryBankRequest) {
  const res = await api.post<{ success: boolean; message: string; data: MemoryBank }>(
    '/api/agent-memory/banks',
    request
  )
  return res.data.data
}

export async function getMemoryBank(id: number) {
  const res = await api.get<{ success: boolean; message: string; data: MemoryBank }>(
    `/api/agent-memory/banks/${id}`
  )
  return res.data.data
}

export async function updateMemoryBank(id: number, request: UpdateMemoryBankRequest) {
  const res = await api.put<{ success: boolean; message: string }>(
    `/api/agent-memory/banks/${id}`,
    request
  )
  return res.data
}

export async function deleteMemoryBank(id: number) {
  const res = await api.delete<{ success: boolean; message: string }>(
    `/api/agent-memory/banks/${id}`
  )
  return res.data
}

export async function retainMemory(request: MemoryRetainRequest) {
  const res = await api.post<{ success: boolean; message: string; data: MemoryRetainResponse }>(
    '/api/agent-memory/retain',
    request
  )
  return res.data.data
}

export async function recallMemory(request: MemoryRecallRequest) {
  const res = await api.post<{ success: boolean; message: string; data: MemoryRecallResponse }>(
    '/api/agent-memory/recall',
    request
  )
  return res.data.data
}

export async function reflectMemory(request: MemoryReflectRequest) {
  const res = await api.post<{ success: boolean; message: string; data: MemoryReflectResponse }>(
    '/api/agent-memory/reflect',
    request
  )
  return res.data.data
}

export async function consolidateMemory(bankId: number) {
  const res = await api.post<{ success: boolean; message: string }>(
    `/api/agent-memory/consolidate?bank_id=${bankId}`
  )
  return res.data
}

export async function listKnowledgePages(bankId: number, pathPrefix?: string) {
  const params: Record<string, string> = { bank_id: String(bankId) }
  if (pathPrefix) {
    params.path_prefix = pathPrefix
  }
  const res = await api.get<{ success: boolean; message: string; data: KnowledgePage[] }>(
    '/api/agent-memory/knowledge-pages',
    { params }
  )
  return res.data.data
}

export async function createKnowledgePage(request: {
  bank_id: number
  title: string
  content: string
  path: string
  parent_id?: number
}) {
  const res = await api.post<{ success: boolean; message: string; data: KnowledgePage }>(
    '/api/agent-memory/knowledge-pages',
    request
  )
  return res.data.data
}

export async function updateKnowledgePage(id: number, request: {
  title?: string
  content?: string
  path?: string
}) {
  const res = await api.put<{ success: boolean; message: string }>(
    `/api/agent-memory/knowledge-pages/${id}`,
    request
  )
  return res.data
}

export async function deleteKnowledgePage(id: number) {
  const res = await api.delete<{ success: boolean; message: string }>(
    `/api/agent-memory/knowledge-pages/${id}`
  )
  return res.data
}
