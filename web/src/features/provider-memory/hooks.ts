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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

import {
  consolidateProviderFacts,
  deleteProviderMentalModel,
  getProviderMemoryConfig,
  getProviderMemoryStats,
  listProviderMemoryFacts,
  listProviderMentalModels,
  listProviderObservations,
  pruneOldProviderFacts,
  updateProviderMemoryConfig,
  upsertProviderMentalModel,
} from './api'
import type { ProviderMemoryConfig } from './api'

const STATS_KEY = ['provider-memory', 'stats'] as const
const CONFIG_KEY = ['provider-memory', 'config'] as const
const FACTS_KEY = ['provider-memory', 'facts'] as const
const OBS_KEY = ['provider-memory', 'observations'] as const
const MM_KEY = ['provider-memory', 'mental-models'] as const

export function useProviderMemoryStats() {
  return useQuery({
    queryKey: STATS_KEY,
    queryFn: getProviderMemoryStats,
    refetchInterval: 30_000,
  })
}

export function useProviderMemoryConfig() {
  return useQuery({
    queryKey: CONFIG_KEY,
    queryFn: getProviderMemoryConfig,
  })
}

export function useUpdateProviderMemoryConfig() {
  const qc = useQueryClient()
  const { t } = useTranslation()
  return useMutation({
    mutationFn: (config: Partial<ProviderMemoryConfig>) =>
      updateProviderMemoryConfig(config),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONFIG_KEY })
      qc.invalidateQueries({ queryKey: STATS_KEY })
      toast.success(t('Configuration updated'))
    },
  })
}

export function useProviderMemoryFacts(params?: {
  page?: number
  page_size?: number
  channel_id?: number
  model_name?: string
}) {
  return useQuery({
    queryKey: [...FACTS_KEY, params],
    queryFn: () => listProviderMemoryFacts(params),
  })
}

export function useProviderObservations(params?: {
  page?: number
  page_size?: number
  channel_id?: number
  model_name?: string
}) {
  return useQuery({
    queryKey: [...OBS_KEY, params],
    queryFn: () => listProviderObservations(params),
  })
}

export function useProviderMentalModels() {
  return useQuery({
    queryKey: MM_KEY,
    queryFn: listProviderMentalModels,
  })
}

export function useConsolidateProviderFacts() {
  const qc = useQueryClient()
  const { t } = useTranslation()
  return useMutation({
    mutationFn: consolidateProviderFacts,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['provider-memory'] })
      toast.success(
        t('Consolidation completed: {{count}} observations', {
          count: data.observations_added,
        })
      )
    },
  })
}

export function usePruneOldProviderFacts() {
  const qc = useQueryClient()
  const { t } = useTranslation()
  return useMutation({
    mutationFn: (before: number) => pruneOldProviderFacts(before),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['provider-memory'] })
      toast.success(
        t('Pruned {{count}} facts', { count: data.rows_deleted })
      )
    },
  })
}

export function useUpsertProviderMentalModel() {
  const qc = useQueryClient()
  const { t } = useTranslation()
  return useMutation({
    mutationFn: upsertProviderMentalModel,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MM_KEY })
      toast.success(t('Mental model saved'))
    },
  })
}

export function useDeleteProviderMentalModel() {
  const qc = useQueryClient()
  const { t } = useTranslation()
  return useMutation({
    mutationFn: ({
      sourceQuery,
      scopeModel,
    }: {
      sourceQuery: string
      scopeModel: string
    }) => deleteProviderMentalModel(sourceQuery, scopeModel),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MM_KEY })
      toast.success(t('Mental model deleted'))
    },
  })
}