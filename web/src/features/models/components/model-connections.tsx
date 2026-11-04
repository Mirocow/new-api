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
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { EmptyState } from '@/components/empty-state'
import { GroupBadge } from '@/components/group-badge'
import { StatusBadge } from '@/components/status-badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { formatNumber } from '@/lib/format'

import { getModelChannels, type ModelChannelInfo } from '../api'
import type { Model } from '../types'
import { ModelSquareStatus } from './model-square-status'

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

export function ModelConnections(props: { model: Model }) {
  const { t } = useTranslation()

  // Fetch detailed channel info with priority, weight, and health metrics
  const { data: channelsData, isLoading, error } = useQuery({
    queryKey: ['model-channels', props.model.model_name],
    queryFn: () => getModelChannels(props.model.model_name),
    enabled: !!props.model.model_name,
    staleTime: 30000,
  })

  const channels = channelsData?.data?.channels || []

  return (
    <div className='min-h-0 flex-1 space-y-6 overflow-auto p-4'>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Channel availability and group access are derived from enabled channels. Importing metadata does not create a callable channel.'
        )}
      </p>
      <ModelSquareStatus model={props.model} detail />
      <section className='space-y-3'>
        <h3 className='font-medium'>{t('Bound Channels')}</h3>
        {isLoading ? (
          <div className='text-center py-4 text-muted-foreground'>{t('Loading channel details...')}</div>
        ) : error ? (
          <EmptyState title={t('Failed to load channel details')} description={String(error)} />
        ) : channels.length ? (
          <StaticDataTable
            data={channels}
            columns={[
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
                  <span className='font-mono'>{ch.weight}</span>
                ),
                size: 70,
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
                  </div>
                ),
                size: 200,
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
                  <GroupBadge group={ch.group} />
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
      </section>
      <section className='space-y-3'>
        <h3 className='font-medium'>{t('Enable Groups')}</h3>
        <div className='flex flex-wrap gap-2'>
          {props.model.enable_groups?.map((group) => (
            <GroupBadge key={group} group={group} />
          ))}
          {!props.model.enable_groups?.length && (
            <span className='text-muted-foreground text-sm'>
              {t('No enabled groups')}
            </span>
          )}
        </div>
      </section>
      <section className='space-y-3'>
        <h3 className='font-medium'>{t('Supported endpoints')}</h3>
        <div className='flex flex-wrap gap-2'>
          {props.model.supported_endpoints?.map((endpoint) => (
            <StatusBadge key={endpoint} variant='neutral' label={endpoint} />
          ))}
          {!props.model.supported_endpoints?.length && (
            <span className='text-muted-foreground text-sm'>
              {t('No endpoints inferred from channels')}
            </span>
          )}
        </div>
      </section>
      {props.model.name_rule !== 0 && (
        <section className='space-y-3'>
          <h3 className='font-medium'>{t('Matched models')}</h3>
          <div className='flex flex-wrap gap-2'>
            {props.model.matched_models?.map((name) => (
              <StatusBadge key={name} variant='neutral' label={name} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}