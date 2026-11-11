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
  getBulkModelSuitability,
  getChannelsForMentalModel,
  getModelSuitability,
  getProviderMemoryConfig,
  getProviderMemoryStats,
  listProviderMemoryFacts,
  listProviderMentalModels,
  listProviderObservations,
  pruneOldProviderFacts,
  updateProviderMemoryConfig,
  upsertProviderMentalModel,
  type ModelSuitability,
  type ProviderMemoryConfig,
} from './api'

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

const CHANNELS_MM_KEY = ['provider-memory', 'channels-for-mm'] as const

/**
 * Fetch channel types, channel models, and gateway models (incl. aliases)
 * for mental model scope selection
 */
export function useChannelsForMentalModel() {
  return useQuery({
    queryKey: CHANNELS_MM_KEY,
    queryFn: getChannelsForMentalModel,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

const SUITABILITY_KEY = ['provider-memory', 'model-suitability'] as const

/**
 * Fetch suitability and preference info for a model + source query.
 * Used to show hints in the mental model creation/edit form.
 */
export function useModelSuitability(
  sourceQuery: string,
  scopeModel: string,
  enabled = true
) {
  return useQuery<ModelSuitability>({
    queryKey: [...SUITABILITY_KEY, sourceQuery, scopeModel],
    queryFn: () => getModelSuitability(sourceQuery, scopeModel),
    enabled: enabled && sourceQuery !== '' && scopeModel !== '',
    staleTime: 30_000, // 30 seconds
  })
}

const BULK_SUITABILITY_KEY = ['provider-memory', 'model-suitability-bulk'] as const

/**
 * Fetch suitability info for all models for a given source query.
 * Used to show suitability badges in the model dropdown.
 */
export function useBulkModelSuitability(
  sourceQuery: string,
  enabled = true
) {
  return useQuery<Record<string, ModelSuitability>>({
    queryKey: [...BULK_SUITABILITY_KEY, sourceQuery],
    queryFn: () => getBulkModelSuitability(sourceQuery),
    enabled: enabled && sourceQuery !== '',
    staleTime: 30_000, // 30 seconds
  })
}