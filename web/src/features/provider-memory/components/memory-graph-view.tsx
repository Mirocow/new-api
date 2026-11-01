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
  type ReactFlowProps,
} from '@xyflow/react'
import { Database, Eye, Sparkles } from 'lucide-react'
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
import { useMemo, useState } from 'react'

import '@xyflow/react/dist/style.css'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import type { ProviderMentalModel, ProviderObservation } from '../api'
import { useProviderMentalModels, useProviderObservations } from '../hooks'

// --- Parsed payload shapes (mirrors backend aggregate()/rankBy() output) ---

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

/**
 * Mirrors the backend classifyQuery() intent rules: latency/cost rankings are
 * ascending (lower score wins), success rankings are descending (higher wins).
 */
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

// --- Flow node types ---

interface FactNodeData extends Record<string, unknown> {
  modelName: string
  channelId: number
  factCount: number
}
type FactFlowNode = Node<FactNodeData, 'fact'>

interface ObservationNodeData extends Record<string, unknown> {
  modelName: string
  channelId: number
  avgLatencyMs: number | null
  successRate: number | null
  errorRate: number | null
  confidence: number
}
type ObservationFlowNode = Node<ObservationNodeData, 'observation'>

interface MentalModelNodeData extends Record<string, unknown> {
  scopeModel: string
  sourceQuery: string
  ranking: RankEntry[]
  direction: 'lower' | 'higher' | null
}
type MentalModelFlowNode = Node<MentalModelNodeData, 'mentalModel'>

type MemoryFlowNode = FactFlowNode | ObservationFlowNode | MentalModelFlowNode

const FACT_COLUMN_X = 0
const OBSERVATION_COLUMN_X = 470
const MODEL_COLUMN_X = 950
const FACT_ROW_HEIGHT = 118
const OBSERVATION_ROW_HEIGHT = 178
const MODEL_ROW_HEIGHT = 240

function confidenceColor(c: number): string {
  if (c >= 0.8) {
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
  }
  if (c >= 0.5) {
    return 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
  }
  return 'bg-muted text-muted-foreground'
}

function FactNode({ data }: NodeProps<FactFlowNode>) {
  const { t } = useTranslation()
  return (
    <div
      className='bg-card w-[280px] rounded-xl border border-blue-200 p-3 shadow-sm dark:border-blue-500/30'
      title={`${data.modelName} · #${data.channelId}`}
    >
      <Handle
        type='source'
        position={Position.Right}
        className='!border-blue-300 !bg-blue-500'
      />
      <div className='flex items-center gap-2'>
        <Database
          className='size-4 shrink-0 text-blue-600 dark:text-blue-400'
          aria-hidden='true'
        />
        <span className='truncate text-xs font-medium'>{data.modelName}</span>
      </div>
      <div className='mt-2 flex items-center justify-between gap-2'>
        <span className='text-muted-foreground font-mono text-xs'>
          #{data.channelId}
        </span>
        <Badge variant='secondary' className='font-mono tabular-nums'>
          {data.factCount} × {t('Facts')}
        </Badge>
      </div>
    </div>
  )
}

function ObservationNode({ data }: NodeProps<ObservationFlowNode>) {
  const { t } = useTranslation()
  return (
    <div
      className='bg-card w-[280px] rounded-xl border border-amber-200 p-3 shadow-sm dark:border-amber-500/30'
      title={`${data.modelName} · #${data.channelId}`}
    >
      <Handle
        type='target'
        position={Position.Left}
        className='!border-blue-300 !bg-blue-500'
      />
      <Handle
        type='source'
        position={Position.Right}
        className='!border-amber-300 !bg-amber-500'
      />
      <div className='flex items-center gap-2'>
        <Eye
          className='size-4 shrink-0 text-amber-600 dark:text-amber-400'
          aria-hidden='true'
        />
        <span className='truncate text-xs font-medium'>{data.modelName}</span>
        <span className='text-muted-foreground ml-auto font-mono text-xs'>
          #{data.channelId}
        </span>
      </div>
      <dl className='mt-2 space-y-1 text-xs'>
        <div className='flex items-center justify-between gap-2'>
          <dt className='text-muted-foreground truncate'>
            {t('Average latency')}
          </dt>
          <dd className='font-mono tabular-nums'>
            {data.avgLatencyMs == null ? '—' : `${data.avgLatencyMs} ms`}
          </dd>
        </div>
        <div className='flex items-center justify-between gap-2'>
          <dt className='text-muted-foreground truncate'>
            {t('Success rate')}
          </dt>
          <dd className='font-mono tabular-nums'>
            {data.successRate == null
              ? '—'
              : `${(data.successRate * 100).toFixed(1)}%`}
          </dd>
        </div>
        <div className='flex items-center justify-between gap-2'>
          <dt className='text-muted-foreground truncate'>{t('Error rate')}</dt>
          <dd className='font-mono tabular-nums'>
            {data.errorRate == null
              ? '—'
              : `${(data.errorRate * 100).toFixed(1)}%`}
          </dd>
        </div>
      </dl>
      <div className='mt-2 flex items-center justify-between gap-2'>
        <span className='text-muted-foreground text-xs'>{t('Confidence')}</span>
        <Badge
          variant='secondary'
          className={cn(
            'font-mono tabular-nums',
            confidenceColor(data.confidence)
          )}
        >
          {(data.confidence * 100).toFixed(0)}%
        </Badge>
      </div>
    </div>
  )
}

function MentalModelNode({ data }: NodeProps<MentalModelFlowNode>) {
  const { t } = useTranslation()
  const ranking = data.ranking.slice(0, 6)
  const overflow = data.ranking.length - ranking.length
  return (
    <div
      className='bg-card w-[280px] rounded-xl border border-emerald-200 p-3 shadow-sm dark:border-emerald-500/30'
      title={`${data.scopeModel} · ${data.sourceQuery}`}
    >
      <Handle
        type='target'
        position={Position.Left}
        className='!border-amber-300 !bg-amber-500'
      />
      <div className='flex items-center gap-2'>
        <Sparkles
          className='size-4 shrink-0 text-emerald-600 dark:text-emerald-400'
          aria-hidden='true'
        />
        <span className='truncate text-xs font-medium'>{data.scopeModel}</span>
      </div>
      <p className='text-muted-foreground mt-1 truncate font-mono text-xs'>
        {data.sourceQuery}
      </p>
      {data.direction != null && (
        <p className='text-muted-foreground mt-0.5 text-xs italic'>
          {data.direction === 'higher'
            ? t('Higher is better')
            : t('Lower is better')}
        </p>
      )}
      {ranking.length === 0 ? (
        <p className='text-muted-foreground mt-2 text-xs'>{t('No data')}</p>
      ) : (
        <ol className='mt-2 space-y-1'>
          {ranking.map((entry, i) => (
            <li
              key={`${entry.channel_id}-${entry.model}`}
              className='flex items-center justify-between gap-2 text-xs'
            >
              <span className='text-muted-foreground font-mono tabular-nums'>
                {i + 1}.
              </span>
              <span className='truncate font-mono'>
                {entry.model} · #{entry.channel_id}
              </span>
              <span className='ml-auto shrink-0 font-mono tabular-nums'>
                {formatScore(entry.score)}
              </span>
            </li>
          ))}
          {overflow > 0 && (
            <li className='text-muted-foreground text-xs'>+{overflow}</li>
          )}
        </ol>
      )}
    </div>
  )
}

const nodeTypes: NodeTypes = {
  fact: FactNode,
  observation: ObservationNode,
  mentalModel: MentalModelNode,
}

// --- Graph assembly ---

interface MemoryGraph {
  nodes: MemoryFlowNode[]
  edges: Edge[]
  models: string[]
}

function isGlobalScope(scopeModel: string): boolean {
  return scopeModel === '*' || scopeModel === ''
}

function buildMemoryGraph(
  observations: ProviderObservation[],
  mentalModels: ProviderMentalModel[],
  selectedModel: string
): MemoryGraph {
  const scoped = selectedModel
    ? observations.filter((o) => o.model_name === selectedModel)
    : observations

  // One active observation per (channel, model) scope is the normal case;
  // keep the freshest if several are active.
  const byScope = new Map<string, ProviderObservation>()
  for (const o of scoped) {
    const key = `${o.channel_id}:${o.model_name}`
    const prev = byScope.get(key)
    if (prev == null || o.created_at > prev.created_at) {
      byScope.set(key, o)
    }
  }
  const scopes = [...byScope.keys()].sort((a, b) => a.localeCompare(b))

  const models = [...new Set(scoped.map((o) => o.model_name))].sort((a, b) =>
    a.localeCompare(b)
  )

  const visibleModels = selectedModel
    ? new Set([selectedModel])
    : new Set(models)

  const nodes: MemoryFlowNode[] = []
  const edges: Edge[] = []

  scopes.forEach((scope, i) => {
    const o = byScope.get(scope)
    if (o == null) return
    nodes.push({
      id: `fact:${scope}`,
      type: 'fact',
      position: { x: FACT_COLUMN_X, y: i * FACT_ROW_HEIGHT },
      data: {
        modelName: o.model_name,
        channelId: o.channel_id,
        factCount: o.sample_size,
      },
    })
    const metrics = parseJson<ObservationMetrics>(o.metrics, {})
    nodes.push({
      id: `obs:${scope}`,
      type: 'observation',
      position: { x: OBSERVATION_COLUMN_X, y: i * OBSERVATION_ROW_HEIGHT },
      data: {
        modelName: o.model_name,
        channelId: o.channel_id,
        avgLatencyMs:
          typeof metrics.avg_latency_ms === 'number'
            ? metrics.avg_latency_ms
            : null,
        successRate:
          typeof metrics.success_rate === 'number'
            ? metrics.success_rate
            : null,
        errorRate:
          typeof metrics.error_rate === 'number' ? metrics.error_rate : null,
        confidence: o.confidence,
      },
    })
    edges.push({
      id: `edge:fact:${scope}`,
      source: `fact:${scope}`,
      target: `obs:${scope}`,
      animated: true,
    })
  })

  const visibleMentalModels = mentalModels
    .filter(
      (mm) => isGlobalScope(mm.scope_model) || visibleModels.has(mm.scope_model)
    )
    .sort(
      (a, b) =>
        a.scope_model.localeCompare(b.scope_model) ||
        a.source_query.localeCompare(b.source_query)
    )

  visibleMentalModels.forEach((mm, j) => {
    const ranking = parseJson<RankEntry[]>(mm.payload, [])
    nodes.push({
      id: `mm:${mm.source_query}:${mm.scope_model}`,
      type: 'mentalModel',
      position: { x: MODEL_COLUMN_X, y: j * MODEL_ROW_HEIGHT },
      data: {
        scopeModel: mm.scope_model,
        sourceQuery: mm.source_query,
        ranking,
        direction: scoreDirection(mm.source_query),
      },
    })
    for (const scope of scopes) {
      const o = byScope.get(scope)
      if (o == null) continue
      if (isGlobalScope(mm.scope_model) || mm.scope_model === o.model_name) {
        edges.push({
          id: `edge:obs:${scope}:mm:${mm.source_query}:${mm.scope_model}`,
          source: `obs:${scope}`,
          target: `mm:${mm.source_query}:${mm.scope_model}`,
        })
      }
    }
  })

  return { nodes, edges, models }
}

// --- View ---

export function MemoryGraphView() {
  const { t } = useTranslation()
  const [selectedModel, setSelectedModel] = useState('')

  const observationsQuery = useProviderObservations({
    page: 1,
    page_size: 500,
  })
  const mentalModelsQuery = useProviderMentalModels()

  const isLoading = observationsQuery.isLoading || mentalModelsQuery.isLoading
  const isError = observationsQuery.isError || mentalModelsQuery.isError

  const graph = useMemo(
    () =>
      buildMemoryGraph(
        observationsQuery.data?.data ?? [],
        mentalModelsQuery.data?.data ?? [],
        selectedModel
      ),
    [observationsQuery.data, mentalModelsQuery.data, selectedModel]
  )

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
      <Card>
        <CardContent className='text-muted-foreground py-8 text-center text-sm'>
          {t('Failed to load memory graph')}
        </CardContent>
      </Card>
    )
  }

  if (graph.nodes.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={Database}
            title={t('No data')}
            description={t(
              'No memory data yet. Enable Provider Memory, let requests flow, then run consolidation.'
            )}
          />
        </CardContent>
      </Card>
    )
  }

  const factCount = graph.nodes.filter((n) => n.type === 'fact').length
  const observationCount = graph.nodes.filter(
    (n) => n.type === 'observation'
  ).length
  const modelCount = graph.nodes.filter((n) => n.type === 'mentalModel').length

  const onNodeClick: ReactFlowProps['onNodeClick'] = (_, node) => {
    if (node.type === 'fact' || node.type === 'observation') {
      const modelName = (node.data as FactNodeData).modelName
      setSelectedModel((current) => (current === modelName ? '' : modelName))
      return
    }
    if (node.type === 'mentalModel') {
      const scope = (node.data as MentalModelNodeData).scopeModel
      if (!isGlobalScope(scope)) {
        setSelectedModel((current) => (current === scope ? '' : scope))
      }
    }
  }

  return (
    <div className='space-y-3'>
      {/* Legend + filter */}
      <div className='flex flex-wrap items-center gap-x-4 gap-y-2 text-xs'>
        <span className='text-muted-foreground inline-flex items-center gap-1.5'>
          <span
            className='inline-block size-2 rounded-full bg-blue-500'
            aria-hidden='true'
          />
          {t('Raw Facts (Retain)')} · {factCount}
        </span>
        <span className='text-muted-foreground inline-flex items-center gap-1.5'>
          <span
            className='inline-block size-2 rounded-full bg-amber-500'
            aria-hidden='true'
          />
          {t('Observations (Reflect)')} · {observationCount}
        </span>
        <span className='text-muted-foreground inline-flex items-center gap-1.5'>
          <span
            className='inline-block size-2 rounded-full bg-emerald-500'
            aria-hidden='true'
          />
          {t('Mental Models (Routing)')} · {modelCount}
        </span>
        <label className='text-muted-foreground ml-auto inline-flex items-center gap-2'>
          <span className='sr-only'>{t('Filter by model')}</span>
          <span aria-hidden='true'>{t('Filter by model')}</span>
          <NativeSelect
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            aria-label={t('Filter by model')}
          >
            <NativeSelectOption value=''>{t('All models')}</NativeSelectOption>
            {graph.models.map((m) => (
              <NativeSelectOption key={m} value={m}>
                {m}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      </div>

      {/* Canvas */}
      <div className='border-border h-[640px] overflow-hidden rounded-xl border'>
        <ReactFlow
          nodes={graph.nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          nodesDraggable={false}
          nodesConnectable={false}
          minZoom={0.15}
          fitView
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            nodeColor={(node) => {
              if (node.type === 'fact') return '#3b82f6'
              if (node.type === 'observation') return '#f59e0b'
              return '#10b981'
            }}
          />
        </ReactFlow>
      </div>
    </div>
  )
}
