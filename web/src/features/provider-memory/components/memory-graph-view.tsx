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
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react'
import {
  Activity,
  Database,
  GitBranch,
  Network,
  TrendingUp,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import '@xyflow/react/dist/style.css'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import type {
  ProviderMemoryFact,
  ProviderMentalModel,
  ProviderObservation,
} from '../api'
import {
  useProviderMemoryFacts,
  useProviderMentalModels,
  useProviderObservations,
} from '../hooks'

// ─── helpers ────────────────────────────────────────────────────────────────

interface FactMetrics {
  latency_ms?: number
  error_rate?: number
  cost_per_1k?: number
  success_rate?: number
  quota_used?: number
  prompt_tokens?: number
  completion_tokens?: number
}

interface ObservationMetrics {
  sample_size?: number
  avg_latency_ms?: number
  success_rate?: number
  error_rate?: number
}

interface RankEntry {
  channel_id: number
  model: string
  score: number
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function parseEntities(raw: string): string[] {
  return raw
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
}

function parseKeywords(raw: string): string[] {
  return raw
    .split(/\s+/)
    .map((k) => k.trim())
    .filter(Boolean)
}

function scoreDirection(sourceQuery: string): 'lower' | 'higher' | null {
  const q = sourceQuery.toLowerCase()
  if (
    q.includes('latency') ||
    q.includes('fast') ||
    q.includes('cost') ||
    q.includes('cheap')
  ) {
    return 'lower'
  }
  if (q.includes('success') || q.includes('reliab')) {
    return 'higher'
  }
  return null
}

function formatScore(score: number): string {
  const abs = Math.abs(score)
  if (abs >= 100) return score.toFixed(0)
  if (abs >= 10) return score.toFixed(1)
  return score.toFixed(3)
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  return `${ms}ms`
}

function formatTime(unix: number): string {
  if (!unix) return '—'
  return new Date(unix * 1000).toLocaleString()
}

function confidenceColor(c: number): string {
  if (c >= 0.8) {
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
  }
  if (c >= 0.5) {
    return 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
  }
  return 'bg-muted text-muted-foreground'
}

// ─── Section 1: Time Series ─────────────────────────────────────────────────

function TimeSeriesSection({
  facts,
  observations,
  selectedModel,
}: {
  facts: ProviderMemoryFact[]
  observations: ProviderObservation[]
  selectedModel: string
}) {
  const { t } = useTranslation()

  const filtered = useMemo(() => {
    let f = facts
    if (selectedModel !== '__all__') {
      f = f.filter((x) => x.model_name === selectedModel)
    }
    return [...f].sort((a, b) => a.retained_at - b.retained_at)
  }, [facts, selectedModel])

  const filteredObs = useMemo(() => {
    let o = observations.filter((x) => x.superseded_by === null)
    if (selectedModel !== '__all__') {
      o = o.filter((x) => x.model_name === selectedModel)
    }
    return [...o].sort((a, b) => a.created_at - b.created_at)
  }, [observations, selectedModel])

  if (filtered.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title={t('No time series data')}
        description={t(
          'No memory data yet. Enable Provider Memory, let requests flow, then run consolidation.'
        )}
      />
    )
  }

  // Build latency series
  const latencies = filtered.map((f) => {
    const m = parseJson<FactMetrics>(f.metrics, {})
    return {
      ts: f.retained_at,
      value: m.latency_ms ?? 0,
      success: f.success,
      channel: f.channel_id,
    }
  })

  const maxLat = Math.max(...latencies.map((l) => l.value), 1)
  const minTs = latencies[0]?.ts ?? 0
  const maxTs = latencies.at(-1)?.ts ?? 1
  const tsRange = Math.max(maxTs - minTs, 1)

  // Build success-rate buckets (per observation window)
  const obsPoints = filteredObs.map((o) => {
    const m = parseJson<ObservationMetrics>(o.metrics, {})
    return {
      ts: o.created_at,
      successRate: (m.success_rate ?? 0) * 100,
      errorRate: (m.error_rate ?? 0) * 100,
      sampleSize: m.sample_size ?? o.sample_size,
      confidence: o.confidence,
      channel: o.channel_id,
    }
  })

  return (
    <div className='space-y-4'>
      {/* Latency timeline */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-sm'>
            <Activity className='size-4' />
            {t('Latency timeline')}
            <Badge variant='secondary' className='ml-auto'>
              {filtered.length} {t('facts')}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='flex h-48 items-end gap-px overflow-x-auto'>
            {latencies.map((l, i) => {
              const h = (l.value / maxLat) * 100
              const x = ((l.ts - minTs) / tsRange) * 100
              return (
                <div
                  key={`lat-${l.ts}-${l.channel}`}
                  className='group relative flex shrink-0 flex-col justify-end'
                  style={{
                    height: '100%',
                    width: '6px',
                    marginLeft: i === 0 ? `${x}%` : 0,
                  }}
                  title={`${formatTime(l.ts)}\nch#${l.channel}: ${formatMs(l.value)}\n${l.success ? '✓' : '✗'}`}
                >
                  <div
                    className={cn(
                      'w-full rounded-sm transition-colors',
                      l.success
                        ? 'bg-blue-400 dark:bg-blue-500'
                        : 'bg-red-400 dark:bg-red-500'
                    )}
                    style={{ height: `${Math.max(h, 2)}%` }}
                  />
                </div>
              )
            })}
          </div>
          <div className='text-muted-foreground mt-2 flex justify-between text-xs'>
            <span>{formatTime(minTs)}</span>
            <span>
              {t('max')}: {formatMs(maxLat)}
            </span>
            <span>{formatTime(maxTs)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Success/Error rate over observation windows */}
      {obsPoints.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-sm'>
              <TrendingUp className='size-4' />
              {t('Success / Error rate over time')}
              <Badge variant='secondary' className='ml-auto'>
                {obsPoints.length} {t('observations')}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='flex h-40 items-end gap-2 overflow-x-auto pb-2'>
              {obsPoints.map((o) => (
                <div
                  key={`obs-${o.ts}-${o.channel}`}
                  className='flex shrink-0 flex-col items-center gap-1'
                  style={{ width: '60px' }}
                  title={`${formatTime(o.ts)}\nch#${o.channel}\nsuccess: ${o.successRate.toFixed(1)}%\nerror: ${o.errorRate.toFixed(1)}%\nsamples: ${o.sampleSize}`}
                >
                  <div className='flex h-32 w-full items-end gap-px overflow-hidden rounded'>
                    <div
                      className='w-1/2 rounded-l bg-emerald-400 dark:bg-emerald-500'
                      style={{ height: `${o.successRate}%` }}
                    />
                    <div
                      className='w-1/2 rounded-r bg-red-400 dark:bg-red-500'
                      style={{ height: `${o.errorRate}%` }}
                    />
                  </div>
                  <span className='text-muted-foreground truncate text-[10px]'>
                    {o.successRate.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── Section 2: Search Indices ──────────────────────────────────────────────

function SearchIndicesSection({
  facts,
  selectedModel,
}: {
  facts: ProviderMemoryFact[]
  selectedModel: string
}) {
  const { t } = useTranslation()

  const { entityIndex, keywordIndex, entityStats } = useMemo<{
    entityIndex: Map<string, ProviderMemoryFact[]>
    keywordIndex: Map<string, number>
    entityStats: Map<
      string,
      { count: number; successRate: number; avgLatency: number }
    >
  }>(() => {
    const filtered =
      selectedModel === '__all__'
        ? facts
        : facts.filter((f) => f.model_name === selectedModel)

    const eIdx = new Map<string, ProviderMemoryFact[]>()
    const kIdx = new Map<string, number>()
    const eStats = new Map<
      string,
      { count: number; successRate: number; avgLatency: number }
    >()

    for (const f of filtered) {
      const entities = parseEntities(f.entities)
      for (const e of entities) {
        const arr = eIdx.get(e) ?? []
        arr.push(f)
        eIdx.set(e, arr)
      }

      const keywords = parseKeywords(f.keywords)
      for (const k of keywords) {
        kIdx.set(k, (kIdx.get(k) ?? 0) + 1)
      }
    }

    // Entity stats
    for (const [entity, factList] of eIdx) {
      const successes = factList.filter((f) => f.success).length
      const latencies = factList.map(
        (f) => parseJson<FactMetrics>(f.metrics, {}).latency_ms ?? 0
      )
      eStats.set(entity, {
        count: factList.length,
        successRate: factList.length > 0 ? successes / factList.length : 0,
        avgLatency:
          latencies.length > 0
            ? latencies.reduce((a, b) => a + b, 0) / latencies.length
            : 0,
      })
    }

    return {
      entityIndex: eIdx,
      keywordIndex: kIdx,
      entityStats: eStats,
    }
  }, [facts, selectedModel])

  if (entityIndex.size === 0 && keywordIndex.size === 0) {
    return (
      <EmptyState
        icon={Database}
        title={t('No search index data')}
        description={t('Facts have no entities or keywords yet.')}
      />
    )
  }

  const topKeywords = [...keywordIndex.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)

  const topEntities = [...entityIndex.entries()].sort(
    (a, b) => b[1].length - a[1].length
  )

  return (
    <div className='grid gap-4 md:grid-cols-2'>
      {/* Entity index (graph traversal) */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-sm'>
            <Network className='size-4' />
            {t('Entity index')}
            <Badge variant='secondary' className='ml-auto'>
              {entityIndex.size} {t('entities')}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-2'>
          {topEntities.map(([entity, factList]) => {
            const stats = entityStats.get(entity)
            if (!stats) return null
            return (
              <div
                key={entity}
                className='flex items-center gap-2 rounded-lg border p-2 text-sm'
              >
                <Badge variant='outline' className='shrink-0'>
                  {entity}
                </Badge>
                <span className='text-muted-foreground'>
                  {factList.length} {t('facts')}
                </span>
                <span className='text-muted-foreground'>
                  · {(stats.successRate * 100).toFixed(0)}% {t('success')}
                </span>
                <span className='text-muted-foreground'>
                  · {formatMs(Math.round(stats.avgLatency))}
                </span>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Keyword index (BM25-lite) */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-sm'>
            <Database className='size-4' />
            {t('Keyword index')}
            <Badge variant='secondary' className='ml-auto'>
              {keywordIndex.size} {t('terms')}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='flex flex-wrap gap-1.5'>
            {topKeywords.map(([kw, count]) => (
              <span
                key={kw}
                className='bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs'
                style={{
                  fontSize: `${Math.min(10 + count * 2, 18)}px`,
                  opacity: Math.min(0.5 + count / 10, 1),
                }}
                title={`${kw}: ${count} ${t('occurrences')}`}
              >
                {kw}
                <span className='text-muted-foreground/60 ml-1'>{count}</span>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Section 3: Entity Relationship Graph ───────────────────────────────────

interface EntityNodeData extends Record<string, unknown> {
  entity: string
  factCount: number
}
type EntityFlowNode = Node<EntityNodeData, 'entity'>

interface FactGraphNodeData extends Record<string, unknown> {
  channelId: number
  modelName: string
  latencyMs: number
  success: boolean
}
type FactFlowNode = Node<FactGraphNodeData, 'factGraph'>

type GraphNode = EntityFlowNode | FactFlowNode

function EntityNode({ data }: NodeProps<EntityFlowNode>) {
  return (
    <div className='min-w-[100px] rounded-lg border-2 border-purple-300 bg-purple-50 px-3 py-2 text-center shadow-sm dark:border-purple-700 dark:bg-purple-950/40'>
      <Handle type='source' position={Position.Left} />
      <Handle type='source' position={Position.Right} />
      <div className='text-sm font-semibold text-purple-700 dark:text-purple-300'>
        {data.entity}
      </div>
      <div className='text-muted-foreground text-xs'>
        {data.factCount} facts
      </div>
    </div>
  )
}

function FactGraphNode({ data }: NodeProps<FactFlowNode>) {
  return (
    <div
      className={cn(
        'min-w-[120px] rounded-lg border px-3 py-2 text-center shadow-sm',
        data.success
          ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/40'
          : 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/40'
      )}
    >
      <Handle type='target' position={Position.Left} />
      <Handle type='target' position={Position.Right} />
      <div className='text-xs font-medium'>ch#{data.channelId}</div>
      <div className='text-muted-foreground text-[10px]'>{data.modelName}</div>
      <div className='text-xs'>{formatMs(data.latencyMs)}</div>
    </div>
  )
}

function EntityGraphSection({
  facts,
  selectedModel,
}: {
  facts: ProviderMemoryFact[]
  selectedModel: string
}) {
  const { t } = useTranslation()

  const graph = useMemo(() => {
    const filtered =
      selectedModel === '__all__'
        ? facts
        : facts.filter((f) => f.model_name === selectedModel)

    // Collect entities and build adjacency
    const entityMap = new Map<string, ProviderMemoryFact[]>()
    for (const f of filtered) {
      for (const e of parseEntities(f.entities)) {
        const arr = entityMap.get(e) ?? []
        arr.push(f)
        entityMap.set(e, arr)
      }
    }

    // Limit to top entities by fact count
    const topEntities = [...entityMap.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 12)

    const nodes: GraphNode[] = []
    const edges: Edge[] = []

    // Entity nodes (center column)
    const entityColX = 400
    topEntities.forEach(([entity, factList], i) => {
      nodes.push({
        id: `entity-${entity}`,
        type: 'entity',
        position: { x: entityColX, y: i * 90 + 20 },
        data: { entity, factCount: factList.length },
      })
    })

    // Fact nodes (left and right of entities)
    const seenFacts = new Set<number>()
    topEntities.forEach(([entity, factList], entityIdx) => {
      const side = entityIdx % 2 === 0 ? -1 : 1
      const factColX = entityColX + side * 280
      factList.slice(0, 6).forEach((f, fi) => {
        if (seenFacts.has(f.id)) return
        seenFacts.add(f.id)
        const m = parseJson<FactMetrics>(f.metrics, {})
        nodes.push({
          id: `fact-${f.id}`,
          type: 'factGraph',
          position: { x: factColX, y: entityIdx * 90 + fi * 35 + 20 },
          data: {
            channelId: f.channel_id,
            modelName: f.model_name,
            latencyMs: m.latency_ms ?? 0,
            success: f.success,
          },
        })
        edges.push({
          id: `e-${f.id}-${entity}`,
          source: side < 0 ? `fact-${f.id}` : `entity-${entity}`,
          target: side < 0 ? `entity-${entity}` : `fact-${f.id}`,
          animated: true,
          style: { stroke: '#a855f7', strokeWidth: 1.5 },
        })
      })
    })

    return { nodes, edges, entityCount: topEntities.length }
  }, [facts, selectedModel])

  if (graph.entityCount === 0) {
    return (
      <EmptyState
        icon={Network}
        title={t('No entity graph')}
        description={t(
          'Facts have no entities. Entities are extracted from context tags.'
        )}
      />
    )
  }

  const nodeTypes: NodeTypes = {
    entity: EntityNode,
    factGraph: FactGraphNode,
  }

  return (
    <div className='border-border h-[600px] overflow-hidden rounded-xl border'>
      <ReactFlow
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        minZoom={0.1}
        fitView
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(node) => (node.type === 'entity' ? '#a855f7' : '#3b82f6')}
        />
      </ReactFlow>
    </div>
  )
}

// ─── Section 4: Mutual Ranking ──────────────────────────────────────────────

function RankingSection({
  mentalModels,
  observations,
}: {
  mentalModels: ProviderMentalModel[]
  observations: ProviderObservation[]
}) {
  const { t } = useTranslation()

  const rankings = useMemo(() => {
    const result: Array<{
      sourceQuery: string
      scopeModel: string
      direction: 'lower' | 'higher' | null
      entries: RankEntry[]
      refreshedAt: number
    }> = []

    for (const mm of mentalModels) {
      const entries = parseJson<RankEntry[]>(mm.payload, [])
      if (entries.length === 0) continue
      result.push({
        sourceQuery: mm.source_query,
        scopeModel: mm.scope_model,
        direction: scoreDirection(mm.source_query),
        entries,
        refreshedAt: mm.refreshed_at,
      })
    }
    return result.sort((a, b) => a.sourceQuery.localeCompare(b.sourceQuery))
  }, [mentalModels])

  // Build cross-model comparison matrix from observations
  const comparison = useMemo(() => {
    const activeObs = observations.filter((o) => o.superseded_by === null)
    const byModel = new Map<string, ProviderObservation[]>()
    for (const o of activeObs) {
      const arr = byModel.get(o.model_name) ?? []
      arr.push(o)
      byModel.set(o.model_name, arr)
    }

    const models = [...byModel.keys()].sort()
    const channels = new Set<number>()
    for (const o of activeObs) channels.add(o.channel_id)
    const channelList = [...channels].sort((a, b) => a - b)

    // Matrix: model → channel → {latency, success, confidence}
    const matrix: Record<
      string,
      Record<number, { latency: number; success: number; confidence: number }>
    > = {}
    for (const [model, obs] of byModel) {
      matrix[model] = {}
      for (const o of obs) {
        const m = parseJson<ObservationMetrics>(o.metrics, {})
        matrix[model][o.channel_id] = {
          latency: m.avg_latency_ms ?? 0,
          success: m.success_rate ?? 0,
          confidence: o.confidence,
        }
      }
    }

    return { models, channels: channelList, matrix }
  }, [observations])

  if (rankings.length === 0 && comparison.models.length === 0) {
    return (
      <EmptyState
        icon={GitBranch}
        title={t('No ranking data')}
        description={t(
          'Mental models and observations are empty. Run consolidation first.'
        )}
      />
    )
  }

  return (
    <div className='space-y-4'>
      {/* Pre-computed rankings from mental models */}
      {rankings.map((r) => (
        <Card key={`${r.sourceQuery}-${r.scopeModel}`}>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-sm'>
              <GitBranch className='size-4' />
              <code className='text-xs'>{r.sourceQuery}</code>
              <Badge variant='outline' className='ml-1'>
                {r.scopeModel}
              </Badge>
              {r.direction && (
                <Badge variant='secondary' className='ml-auto'>
                  {r.direction === 'lower'
                    ? t('Lower is better')
                    : t('Higher is better')}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='space-y-1.5'>
              {r.entries.map((e, i) => {
                const isBest = i === 0
                return (
                  <div
                    key={`${e.channel_id}-${e.model}`}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border p-2 text-sm',
                      isBest &&
                        'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30'
                    )}
                  >
                    <span className='w-6 text-right font-bold'>{i + 1}.</span>
                    <span className='font-medium'>ch#{e.channel_id}</span>
                    <span className='text-muted-foreground'>{e.model}</span>
                    <span className='ml-auto font-mono'>
                      {formatScore(e.score)}
                    </span>
                    {isBest && (
                      <Badge className='bg-emerald-500 text-white'>
                        {t('best')}
                      </Badge>
                    )}
                  </div>
                )
              })}
            </div>
            <div className='text-muted-foreground mt-2 text-xs'>
              {t('Refreshed')}: {formatTime(r.refreshedAt)}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Cross-model comparison matrix */}
      {comparison.models.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-sm'>
              <TrendingUp className='size-4' />
              {t('Cross-model comparison')}
              <Badge variant='secondary' className='ml-auto'>
                {comparison.models.length} × {comparison.channels.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b'>
                    <th className='p-2 text-left'>{t('Model')}</th>
                    {comparison.channels.map((ch) => (
                      <th key={ch} className='p-2 text-center'>
                        ch#{ch}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparison.models.map((model) => {
                    const row = comparison.matrix[model] ?? {}
                    // Find best latency and best success in this row
                    const latencies = comparison.channels
                      .map((ch) => row[ch]?.latency)
                      .filter((v): v is number => v !== undefined)
                    const bestLat =
                      latencies.length > 0 ? Math.min(...latencies) : null
                    const successes = comparison.channels
                      .map((ch) => row[ch]?.success)
                      .filter((v): v is number => v !== undefined)
                    const bestSuc =
                      successes.length > 0 ? Math.max(...successes) : null

                    return (
                      <tr key={model} className='border-b'>
                        <td className='p-2 font-medium'>{model}</td>
                        {comparison.channels.map((ch) => {
                          const cell = row[ch]
                          if (!cell) {
                            return (
                              <td
                                key={ch}
                                className='text-muted-foreground p-2 text-center'
                              >
                                —
                              </td>
                            )
                          }
                          const isBestLat =
                            cell.latency === bestLat && cell.latency > 0
                          const isBestSuc =
                            cell.success === bestSuc && bestSuc !== null
                          return (
                            <td key={ch} className='p-2 text-center'>
                              <div className='space-y-0.5'>
                                <div
                                  className={cn(
                                    'font-mono text-xs',
                                    isBestLat &&
                                      'font-bold text-emerald-600 dark:text-emerald-400'
                                  )}
                                >
                                  {formatMs(cell.latency)}
                                </div>
                                <div
                                  className={cn(
                                    'text-xs',
                                    isBestSuc &&
                                      'font-bold text-emerald-600 dark:text-emerald-400'
                                  )}
                                >
                                  {(cell.success * 100).toFixed(0)}%
                                </div>
                                <div
                                  className={cn(
                                    'text-[10px]',
                                    confidenceColor(cell.confidence)
                                  )}
                                >
                                  ★
                                </div>
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className='text-muted-foreground mt-2 text-xs'>
              {t(
                'Each cell shows latency / success rate / confidence. Best values are highlighted.'
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────

type Section = 'timeseries' | 'indices' | 'entitygraph' | 'ranking'

const SECTIONS: Array<{
  key: Section
  icon: typeof Network
  labelKey: string
}> = [
  { key: 'timeseries', icon: TrendingUp, labelKey: 'Time Series' },
  { key: 'indices', icon: Database, labelKey: 'Search Indices' },
  { key: 'entitygraph', icon: Network, labelKey: 'Entity Graph' },
  { key: 'ranking', icon: GitBranch, labelKey: 'Rankings' },
]

export function MemoryGraphView() {
  const { t } = useTranslation()
  const [section, setSection] = useState<Section>('entitygraph')
  const [selectedModel, setSelectedModel] = useState('__all__')

  const factsQuery = useProviderMemoryFacts({ page_size: 200 })
  const obsQuery = useProviderObservations({ page_size: 200 })
  const mmQuery = useProviderMentalModels()

  const isLoading =
    factsQuery.isLoading || obsQuery.isLoading || mmQuery.isLoading
  const isError = factsQuery.isError || obsQuery.isError || mmQuery.isError

  const factsData = useMemo(
    () => factsQuery.data?.data ?? [],
    [factsQuery.data]
  )
  const obsData = useMemo(() => obsQuery.data?.data ?? [], [obsQuery.data])
  const mmData = useMemo(() => mmQuery.data?.data ?? [], [mmQuery.data])

  const models = useMemo(() => {
    const set = new Set<string>()
    for (const f of factsData) set.add(f.model_name)
    for (const o of obsData) set.add(o.model_name)
    return [...set].sort()
  }, [factsData, obsData])

  if (isLoading) {
    return (
      <Card>
        <CardContent className='space-y-3 py-4'>
          <Skeleton className='h-16 w-full' />
          <Skeleton className='h-16 w-full' />
          <Skeleton className='h-16 w-full' />
          <Skeleton className='h-16 w-full' />
        </CardContent>
      </Card>
    )
  }

  if (isError) {
    return (
      <EmptyState
        icon={Database}
        title={t('Failed to load memory graph')}
        description={t('Check that the provider memory API is reachable.')}
      />
    )
  }

  if (factsData.length === 0 && obsData.length === 0 && mmData.length === 0) {
    return (
      <EmptyState
        icon={Network}
        title={t('Memory Graph')}
        description={t(
          'No memory data yet. Enable Provider Memory, let requests flow, then run consolidation.'
        )}
      />
    )
  }

  return (
    <div className='space-y-4'>
      {/* Section tabs + model filter */}
      <div className='flex flex-wrap items-center gap-2'>
        <div className='flex flex-wrap gap-1'>
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              type='button'
              onClick={() => setSection(s.key)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors',
                section === s.key
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background hover:bg-muted'
              )}
            >
              <s.icon className='size-4' />
              {t(s.labelKey)}
            </button>
          ))}
        </div>

        <label className='ml-auto flex items-center gap-2 text-sm'>
          <span className='text-muted-foreground'>{t('Filter by model')}</span>
          <NativeSelect
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            <NativeSelectOption value='__all__'>
              {t('All models')}
            </NativeSelectOption>
            {models.map((m) => (
              <NativeSelectOption key={m} value={m}>
                {m}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      </div>

      {/* Section content */}
      {section === 'timeseries' && (
        <TimeSeriesSection
          facts={factsData}
          observations={obsData}
          selectedModel={selectedModel}
        />
      )}
      {section === 'indices' && (
        <SearchIndicesSection facts={factsData} selectedModel={selectedModel} />
      )}
      {section === 'entitygraph' && (
        <EntityGraphSection facts={factsData} selectedModel={selectedModel} />
      )}
      {section === 'ranking' && (
        <RankingSection mentalModels={mmData} observations={obsData} />
      )}
    </div>
  )
}
