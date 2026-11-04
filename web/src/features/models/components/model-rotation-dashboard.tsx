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
import { useQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { EmptyState } from '@/components/empty-state'
import { StatusBadge } from '@/components/status-badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Search as SearchIcon, BarChart2, AlertTriangle, CheckCircle, XCircle, HelpCircle, ArrowRight, Shuffle, Layers, Filter, RefreshCw, History, Clock, AlertCircle, GitBranch } from 'lucide-react'
import { formatNumber, formatTimestampToDate } from '@/lib/format'

import { getModels, getModelChannels, getModelRequestHistory, getModelFailoverHistory, type ModelChannelInfo, type ModelRequestLogEntry, type ModelFailoverEvent } from '../api'
import type { Model } from '../types'

function formatLatency(ms?: number): string {
  if (ms === undefined || ms === null) return '—'
  if (ms < 1000) return `${ms.toFixed(0)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function formatRate(rate?: number): string {
  if (rate === undefined || rate === null) return '—'
  return `${(rate * 100).toFixed(2)}%`
}

function formatCost(cost?: number): string {
  if (cost === undefined || cost === null) return '—'
  return `$${cost.toFixed(4)}`
}

function PenaltyBadge({ count, until, reason }: { count: number; until: number; reason: string }) {
  const { t } = useTranslation()
  if (count === 0 && !until) return null
  const now = Date.now()
  const isActive = until > now / 1000
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <StatusBadge
          variant={isActive ? 'destructive' : 'warning'}
          label={isActive ? t('Penalized') : t('Penalty history')}
          size='sm'
          className='cursor-help'
        />
      </TooltipTrigger>
      <TooltipContent side='top' className='max-w-xs'>
        <div className='space-y-1 text-xs'>
          <div>{t('Count:')} {count}</div>
          {isActive && <div>{t('Remaining:')} {Math.ceil((until - now / 1000) / 60)} {t('min')}</div>}
          {reason && <div>{t('Reason:')} {reason}</div>}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

interface ModelWithChannels {
  model: Model
  channels: ModelChannelInfo[]
  totalChannels: number
  enabledChannels: number
  topPriority: number
  hasHealthData: boolean
}

interface ChannelWithSelectionInfo extends ModelChannelInfo {
  // Computed selection info
  priorityLevel: number
  isPenalized: boolean
  isExcluded: boolean
  exclusionReason?: string
  weightPercent: number
  wouldBeSelectedAtRetry: number | null
}

export function ModelRotationDashboard() {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedModel, setSelectedModel] = useState<ModelWithChannels | null>(null)
  const [showAlgorithm, setShowAlgorithm] = useState(true)
  const [selectedGroup, setSelectedGroup] = useState<string>('all')
  const [retryLevel, setRetryLevel] = useState(0)
  const [historyLogs, setHistoryLogs] = useState<ModelRequestLogEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [failoverLogs, setFailoverLogs] = useState<ModelFailoverEvent[]>([])
  const [failoverLoading, setFailoverLoading] = useState(false)

  // Fetch all models
  const { data: modelsData, isLoading: modelsLoading } = useQuery({
    queryKey: ['models-all'],
    queryFn: () => getModels({ page_size: 1000, include_channel_models: true }),
    staleTime: 60000,
  })

  const models = modelsData?.data?.items || []

  // Fetch channels for selected model
  const { data: channelsData, isLoading: channelsLoading, refetch: refetchChannels } = useQuery({
    queryKey: ['model-channels', selectedModel?.model.model_name],
    queryFn: () => getModelChannels(selectedModel!.model.model_name),
    enabled: !!selectedModel,
    staleTime: 30000,
  })

  // Build model list with channel counts
  const modelsWithChannels: ModelWithChannels[] = useMemo(() => {
    return models.map((model) => {
      const boundChannels = model.bound_channels || []
      return {
        model,
        channels: [],
        totalChannels: boundChannels.length,
        enabledChannels: boundChannels.length,
        topPriority: 0,
        hasHealthData: false,
      }
    })
  }, [models])

  // Filter models by search query
  const filteredModels = modelsWithChannels.filter((m) =>
    m.model.model_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.model.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.model.tags?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Process channels with selection info
  const processedChannels: ChannelWithSelectionInfo[] = useMemo(() => {
    if (!channelsData?.data?.channels) return []

    const channels = channelsData.data.channels
    const now = Date.now()

    // Group by priority
    const priorityMap = new Map<number, ModelChannelInfo[]>()
    for (const ch of channels) {
      const p = ch.priority
      if (!priorityMap.has(p)) priorityMap.set(p, [])
      priorityMap.get(p)!.push(ch)
    }

    const sortedPriorities = Array.from(priorityMap.keys()).sort((a, b) => b - a)

    // Calculate weight percentages per priority level
    const result: ChannelWithSelectionInfo[] = []

    sortedPriorities.forEach((priority, priorityIndex) => {
      const priorityChannels = priorityMap.get(priority)!
      const enabledChannels = priorityChannels.filter(c => c.is_enabled && c.penalty_count === 0)
      const penalizedChannels = priorityChannels.filter(c => c.penalty_count > 0 && c.penalty_until * 1000 > now)
      const disabledChannels = priorityChannels.filter(c => !c.is_enabled)

      const totalWeight = enabledChannels.reduce((sum, c) => sum + c.weight, 0) || enabledChannels.length * 100

      // Enabled non-penalized channels
      enabledChannels.forEach((ch, idx) => {
        const weightPercent = totalWeight > 0 ? (ch.weight / totalWeight) * 100 : 100 / enabledChannels.length
        result.push({
          ...ch,
          priorityLevel: priorityIndex,
          isPenalized: false,
          isExcluded: false,
          weightPercent,
          wouldBeSelectedAtRetry: priorityIndex === retryLevel ? priorityIndex : null,
        })
      })

      // Penalized channels
      penalizedChannels.forEach((ch) => {
        result.push({
          ...ch,
          priorityLevel: priorityIndex,
          isPenalized: true,
          isExcluded: true,
          exclusionReason: t('Penalized (errors/timeout)'),
          weightPercent: 0,
          wouldBeSelectedAtRetry: null,
        })
      })

      // Disabled channels
      disabledChannels.forEach((ch) => {
        result.push({
          ...ch,
          priorityLevel: priorityIndex,
          isPenalized: false,
          isExcluded: true,
          exclusionReason: t('Disabled'),
          weightPercent: 0,
          wouldBeSelectedAtRetry: null,
        })
      })
    })

    return result
  }, [channelsData, retryLevel, t])

  // Get unique groups
  const groups = useMemo(() => {
    const g = new Set<string>()
    processedChannels.forEach(c => g.add(c.group))
    return Array.from(g).sort()
  }, [processedChannels])

  // Filter by group
  const filteredChannels = selectedGroup === 'all'
    ? processedChannels
    : processedChannels.filter(c => c.group === selectedGroup)

  const handleModelSelect = (model: ModelWithChannels) => {
    setSelectedModel(model)
    setRetryLevel(0)
    // Fetch history
    setHistoryLoading(true)
    getModelRequestHistory(model.model.model_name, 50).then(res => {
      if (res.data?.logs) setHistoryLogs(res.data.logs)
      setHistoryLoading(false)
    }).catch(() => setHistoryLoading(false))
    // Fetch failovers
    setFailoverLoading(true)
    getModelFailoverHistory(model.model.model_name, 200).then(res => {
      if (res.data?.failovers) setFailoverLogs(res.data.failovers)
      setFailoverLoading(false)
    }).catch(() => setFailoverLoading(false))
  }

  const getPriorityChannels = (priorityLevel: number) => {
    return filteredChannels.filter(c => c.priorityLevel === priorityLevel && !c.isExcluded)
  }

  const getExcludedChannels = (priorityLevel: number) => {
    return filteredChannels.filter(c => c.priorityLevel === priorityLevel && c.isExcluded)
  }

  return (
    <div className='flex h-full min-h-0 flex-col gap-4 p-4'>
      {/* Search and model list */}
      <section className='space-y-4'>
        <div className='flex flex-wrap items-center gap-4'>
          <div className='relative flex-1 min-w-[250px] max-w-md'>
            <SearchIcon className='absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground size-4' />
            <Input
              placeholder={t('Search models...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className='pl-10'
            />
          </div>
          <Select value={selectedGroup} onValueChange={setSelectedGroup}>
            <SelectTrigger className='w-[180px]'>
              <SelectValue placeholder={t('All groups')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>{t('All groups')}</SelectItem>
              {groups.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
          <label className='flex items-center gap-2 text-sm'>
            <input
              type='checkbox'
              checked={showAlgorithm}
              onChange={(e) => setShowAlgorithm(e.target.checked)}
            />
            {t('Show selection algorithm')}
          </label>
        </div>

        <div className='flex-1 min-h-0 border rounded-lg overflow-hidden'>
          {modelsLoading ? (
            <div className='flex h-full items-center justify-center text-muted-foreground'>
              {t('Loading models...')}
            </div>
          ) : filteredModels.length === 0 ? (
            <EmptyState title={t('No models found')} />
          ) : (
            <StaticDataTable
              data={filteredModels}
              columns={[
                {
                  id: 'model_name',
                  header: t('Model'),
                  cell: (m) => (
                    <button
                      onClick={() => handleModelSelect(m)}
                      className='w-full text-left p-2 hover:bg-accent rounded transition-colors flex items-center gap-2'
                    >
                      <span className='font-medium flex-1 truncate'>{m.model.model_name}</span>
                      <span className='flex items-center gap-1 text-xs text-muted-foreground'>
                        <StatusBadge
                          variant={m.totalChannels > 0 ? 'success' : 'secondary'}
                          label={m.totalChannels > 0 ? `${m.totalChannels} ch` : t('No channels')}
                          size='sm'
                        />
                      </span>
                    </button>
                  ),
                  size: 300,
                },
                {
                  id: 'vendor',
                  header: t('Vendor'),
                  cell: (m) => m.model.vendor_id ? `ID: ${m.model.vendor_id}` : '—',
                  size: 120,
                },
                {
                  id: 'channels',
                  header: t('Channels'),
                  cell: (m) => (
                    <div className='flex items-center gap-2'>
                      <StatusBadge
                        variant={m.totalChannels > 0 ? 'success' : 'secondary'}
                        label={m.totalChannels > 0 ? String(m.totalChannels) : t('None')}
                        size='sm'
                      />
                    </div>
                  ),
                  size: 100,
                },
                {
                  id: 'status',
                  header: t('Status'),
                  cell: (m) => (
                    <StatusBadge
                      variant={m.model.status === 1 ? 'success' : 'secondary'}
                      label={m.model.status === 1 ? t('Visible') : t('Hidden')}
                      size='sm'
                    />
                  ),
                  size: 100,
                },
              ]}
            />
          )}
        </div>
      </section>

      {/* Selected model channel details */}
      <section className='space-y-4 flex-1 min-h-0'>
        {selectedModel ? (
          <div className='flex-1 min-h-0 flex flex-col gap-4'>
            {/* Header with model name and retry selector */}
            <div className='p-4 border-b bg-muted/50 flex flex-wrap items-center justify-between gap-4'>
              <div className='flex items-center gap-4'>
                <h3 className='font-medium flex items-center gap-2'>
                  {t('Channels for')} <code className='text-sm'>{selectedModel.model.model_name}</code>
                </h3>
                <div className='flex items-center gap-2'>
                  <span className='text-sm text-muted-foreground'>{t('Simulate retry:')}</span>
                  <Select value={retryLevel} onValueChange={setRetryLevel}>
                    <SelectTrigger className='w-[120px]'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 1, 2, 3, 4, 5].map(r => (
                        <SelectItem key={r} value={r}>
                          {r === 0 ? t('First attempt') : t('Retry {{n}}', { n: r })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <button
                onClick={() => setSelectedModel(null)}
                className='text-muted-foreground hover:text-foreground text-sm'
              >
                {t('Close')}
              </button>
            </div>

            {/* Algorithm Visualization */}
            {showAlgorithm && (
              <AlgorithmVisualization
                channels={filteredChannels}
                retryLevel={retryLevel}
                t={t}
              />
            )}

            {/* Channel Table */}
            <div className='flex-1 min-h-0 border rounded-lg overflow-hidden'>
              <div className='p-4 border-b bg-muted/50'>
                <h4 className='font-medium'>{t('Channel Details')}</h4>
              </div>
              <div className='p-4'>
                {channelsLoading ? (
                  <div className='text-center py-8 text-muted-foreground'>{t('Loading channel details...')}</div>
                ) : filteredChannels.length ? (
                  <StaticDataTable
                    data={filteredChannels}
                    columns={[
                      {
                        id: 'priorityLevel',
                        header: t('Priority Level'),
                        cell: (ch) => (
                          <div className='flex items-center gap-2'>
                            <span className='font-mono font-medium px-2 py-0.5 bg-primary/10 text-primary rounded'>
                              {t('Level {{n}}', { n: ch.priorityLevel })}
                            </span>
                            {ch.wouldBeSelectedAtRetry !== null && (
                              <span className='text-xs text-green-600 font-medium animate-pulse'>
                                {t('→ SELECTED AT THIS RETRY')}
                              </span>
                            )}
                          </div>
                        ),
                        size: 130,
                      },
                      {
                        id: 'priority',
                        header: t('Priority'),
                        cell: (ch) => (
                          <span className='font-mono font-medium'>{ch.priority}</span>
                        ),
                        size: 70,
                      },
                      {
                        id: 'weight',
                        header: t('Weight'),
                        cell: (ch) => (
                          <div className='flex items-center gap-2'>
                            <span className='font-mono'>{ch.weight}</span>
                            {ch.weightPercent > 0 && (
                              <div className='w-24 h-2 bg-muted rounded overflow-hidden'>
                                <div
                                  className='h-full bg-primary'
                                  style={{ width: `${Math.min(ch.weightPercent, 100)}%` }}
                                />
                              </div>
                            )}
                          </div>
                        ),
                        size: 130,
                      },
                      {
                        id: 'name',
                        header: t('Channel'),
                        cell: (ch) => (
                          <div className='flex items-center gap-2'>
                            <span className='font-medium'>{ch.name}</span>
                            <StatusBadge
                              variant={ch.is_enabled ? 'success' : 'secondary'}
                              label={ch.is_enabled ? t('Enabled') : t('Disabled')}
                              size='sm'
                            />
                            <PenaltyBadge
                              count={ch.penalty_count}
                              until={ch.penalty_until * 1000}
                              reason={ch.penalty_reason}
                            />
                            {ch.isExcluded && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <AlertTriangle className='size-4 text-destructive cursor-help' />
                                </TooltipTrigger>
                                <TooltipContent side='top'>
                                  {ch.exclusionReason}
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        ),
                        size: 220,
                      },
                      {
                        id: 'type',
                        header: t('Type'),
                        cell: (ch) => (
                          <StatusBadge variant='neutral' label={String(ch.type)} />
                        ),
                        size: 70,
                      },
                      {
                        id: 'group',
                        header: t('Group'),
                        cell: (ch) => (
                          <span className='px-2 py-0.5 bg-muted rounded text-xs'>{ch.group}</span>
                        ),
                        size: 120,
                      },
                      {
                        id: 'avg_latency_ms',
                        header: t('Avg Latency'),
                        cell: (ch) => formatLatency(ch.avg_latency_ms),
                        size: 100,
                      },
                      {
                        id: 'success_rate',
                        header: t('Success Rate'),
                        cell: (ch) => formatRate(ch.success_rate),
                        size: 100,
                      },
                      {
                        id: 'error_rate',
                        header: t('Error Rate'),
                        cell: (ch) => formatRate(ch.error_rate),
                        size: 100,
                      },
                      {
                        id: 'cost_per_1k',
                        header: t('Cost/1k'),
                        cell: (ch) => formatCost(ch.cost_per_1k),
                        size: 90,
                      },
                      {
                        id: 'sample_size',
                        header: t('Samples'),
                        cell: (ch) => (ch.sample_size ? formatNumber(ch.sample_size) : '—'),
                        size: 80,
                      },
                      {
                        id: 'recommended_priority',
                        header: t('Rec. Priority'),
                        cell: (ch) => ch.recommended_priority !== undefined ? (
                          <span className='font-mono font-medium'>{ch.recommended_priority}</span>
                        ) : '—',
                        size: 100,
                      },
                    ]}
                  />
                ) : (
                  <EmptyState title={t('No channels configured for this model')} />
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className='flex-1 min-h-0 border rounded-lg bg-muted/30 flex items-center justify-center'>
            <div className='text-center text-muted-foreground'>
              <BarChart2 className='mx-auto mb-4 size-12 opacity-50' />
              <p className='text-lg'>{t('Select a model to view its channel rotation')}</p>
              <p className='text-sm'>{t('Channels are sorted by priority (highest first) then by weight')}</p>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

// Algorithm Visualization Component
function AlgorithmVisualization({
  channels,
  retryLevel,
  t,
}: {
  channels: ChannelWithSelectionInfo[]
  retryLevel: number
  t: (key: string) => string
}) {
  const priorityLevels = useMemo(() => {
    const levels = new Map<number, ChannelWithSelectionInfo[]>()
    channels.forEach(ch => {
      if (!levels.has(ch.priorityLevel)) levels.set(ch.priorityLevel, [])
      levels.get(ch.priorityLevel)!.push(ch)
    })
    return Array.from(levels.entries()).sort(([a], [b]) => a - b)
  }, [channels])

  return (
    <div className='border rounded-lg bg-muted/30 p-4 space-y-4'>
      <div className='flex items-center justify-between'>
        <h4 className='font-medium flex items-center gap-2'>
          <Layers className='size-4' />
          {t('Channel Selection Algorithm')}
        </h4>
        <div className='flex items-center gap-2 text-xs text-muted-foreground'>
          <RefreshCw className='size-3' />
          <span>{t('Retry simulation:')} <strong>{retryLevel === 0 ? t('First attempt') : t('Retry {{n}}', { n: retryLevel })}</strong></span>
        </div>
      </div>

      <div className='space-y-3'>
        {priorityLevels.map(([level, levelChannels]) => {
          const available = levelChannels.filter(c => !c.isExcluded)
          const excluded = levelChannels.filter(c => c.isExcluded)
          const isSelectedLevel = level === retryLevel
          const totalWeight = available.reduce((sum, c) => sum + c.weight, 0) || available.length * 100

          return (
            <div
              key={level}
              className={`p-3 rounded-lg border transition-all ${
                isSelectedLevel ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border'
              }`}
            >
              <div className='flex items-center justify-between mb-2'>
                <div className='flex items-center gap-3'>
                  <span className='font-mono font-medium px-2 py-0.5 bg-primary/10 text-primary rounded'>
                    {t('Priority Level {{n}}', { n: level })}
                  </span>
                  {isSelectedLevel && (
                    <span className='text-xs text-green-600 font-medium animate-pulse flex items-center gap-1'>
                      <CheckCircle className='size-3' />
                      {t('ACTIVE FOR RETRY {{n}}', { n: retryLevel })}
                    </span>
                  )}
                  <span className='text-xs text-muted-foreground'>
                    {t('{{available}} available, {{excluded}} excluded', {
                      available: available.length,
                      excluded: excluded.length,
                    })}
                  </span>
                </div>
                <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                  <Shuffle className='size-3' />
                  <span>{t('Weight sum:')} <strong>{totalWeight}</strong></span>
                </div>
              </div>

              {/* Available channels with weight bars */}
              {available.length > 0 && (
                <div className='space-y-1 ml-8'>
                  {available.map((ch) => {
                    const weightPercent = totalWeight > 0 ? (ch.weight / totalWeight) * 100 : 100 / available.length
                    return (
                      <div key={ch.id} className='flex items-center gap-2 text-sm'>
                        <span className='w-8 text-center font-mono text-xs text-muted-foreground'>
                          {weightPercent.toFixed(1)}%
                        </span>
                        <div className='flex-1 h-3 bg-muted rounded overflow-hidden relative'>
                          <div
                            className={`h-full rounded ${
                              isSelectedLevel ? 'bg-primary' : 'bg-green-500'
                            } transition-all`}
                            style={{ width: `${Math.min(weightPercent, 100)}%` }}
                          />
                          {isSelectedLevel && (
                            <div className='absolute right-0 top-0 -translate-y-full text-xs text-primary font-medium whitespace-nowrap'>
                              {t('Selected')}
                            </div>
                          )}
                        </div>
                        <span className='w-32 truncate font-medium text-xs'>{ch.name}</span>
                        <StatusBadge
                          variant={ch.is_enabled ? 'success' : 'secondary'}
                          label={ch.is_enabled ? t('Enabled') : t('Disabled')}
                          size='sm'
                        />
                        {ch.penalty_count > 0 && (
                          <PenaltyBadge
                            count={ch.penalty_count}
                            until={ch.penalty_until * 1000}
                            reason={ch.penalty_reason}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Excluded channels */}
              {excluded.length > 0 && (
                <div className='space-y-1 ml-8 mt-2 pt-2 border-t border-dashed'>
                  {excluded.map((ch) => (
                    <div key={ch.id} className='flex items-center gap-2 text-sm text-muted-foreground opacity-60'>
                      <XCircle className='size-4 text-destructive' />
                      <span className='w-8' />
                      <div className='flex-1 h-3 bg-muted/50 rounded' />
                      <span className='w-32 truncate font-medium text-xs line-through'>{ch.name}</span>
                      <StatusBadge variant='secondary' label={ch.exclusionReason || t('Excluded')} size='sm' />
                      {ch.penalty_count > 0 && (
                        <PenaltyBadge
                          count={ch.penalty_count}
                          until={ch.penalty_until * 1000}
                          reason={ch.penalty_reason}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {available.length === 0 && excluded.length === 0 && (
                <div className='ml-8 text-sm text-muted-foreground italic'>
                  {t('No channels at this priority level')}
                </div>
              )}
            </div>
          )
        })}

        {priorityLevels.length === 0 && (
          <div className='text-center py-8 text-muted-foreground'>
            <Filter className='mx-auto mb-4 size-12 opacity-50' />
            <p>{t('No channels configured for this model')}</p>
          </div>
        )}
      </div>

      {/* Algorithm Steps Explanation */}
      <details className='mt-4 border-t pt-4'>
        <summary className='cursor-pointer font-medium flex items-center gap-2 text-sm'>
          <HelpCircle className='size-4' />
          {t('How channel selection works (click to expand)')}
        </summary>
        <div className='mt-3 space-y-2 text-sm text-muted-foreground'>
          <div className='flex items-start gap-2'>
            <span className='font-mono text-primary'>1.</span>
            <span>{t('Filter by group and model name — only channels in the request\'s group(s) that list this model')}</span>
          </div>
          <div className='flex items-start gap-2'>
            <span className='font-mono text-primary'>2.</span>
            <span>{t('Sort by priority (highest first) — channels grouped by priority level')}</span>
          </div>
          <div className='flex items-start gap-2'>
            <span className='font-mono text-primary'>3.</span>
            <span>{t('Apply filters — exclude penalized channels, task plugin filters, manually excluded channels')}</span>
          </div>
          <div className='flex items-start gap-2'>
            <span className='font-mono text-primary'>4.</span>
            <span>{t('Retry logic — retry=0 uses highest priority, retry=1 uses next priority, etc.')}</span>
          </div>
          <div className='flex items-start gap-2'>
            <span className='font-mono text-primary'>5.</span>
            <span>{t('Weight-based random selection — within the selected priority level, pick channel by weight')}</span>
          </div>
          <div className='flex items-start gap-2'>
            <span className='font-mono text-primary'>6.</span>
            <span>{t('Smoothing — if all weights are 0, each gets equal chance; if avg weight < 10, weights ×100')}</span>
          </div>
          <div className='flex items-start gap-2'>
            <span className='font-mono text-primary'>7.</span>
            <span>{t('Auto-group fallback — if "auto" group and cross-group retry enabled, try next group after exhausting priorities')}</span>
          </div>
        </div>
      </details>
    </div>
  )
}