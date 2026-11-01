import { ChevronDown, ChevronRight } from 'lucide-react'
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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toIntlLocale } from '@/i18n/languages'
import { formatTimestampRelative } from '@/lib/format'
import { cn } from '@/lib/utils'

import { useProviderMemoryFacts } from '../hooks'

const PAGE_SIZE = 20

function parseMetric(metrics: string, key: string): number | null {
  try {
    const obj = JSON.parse(metrics) as Record<string, unknown>
    const v = obj[key]
    return typeof v === 'number' ? v : null
  } catch {
    return null
  }
}

export function MemoryFactsTable() {
  const { t, i18n } = useTranslation()
  const [page, setPage] = useState(1)
  const [modelFilter, setModelFilter] = useState('')
  const [appliedModel, setAppliedModel] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const { data, isLoading, isError } = useProviderMemoryFacts({
    page,
    page_size: PAGE_SIZE,
    model_name: appliedModel || undefined,
  })

  const rows = data?.data ?? []

  if (isLoading) {
    return (
      <Card>
        <CardContent className='space-y-3 py-4'>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={`fact-skel-${i}`} className='h-9 w-full' />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (isError) {
    return (
      <Card>
        <CardContent className='text-muted-foreground py-8 text-center text-sm'>
          {t('Failed to load facts')}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-3'>
        <CardTitle>
          {t('Raw facts ({{count}})', { count: rows.length })}
        </CardTitle>
        <div className='flex items-center gap-2'>
          <Input
            placeholder={t('Filter by model')}
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            className='h-8 w-48'
          />
          <Button
            size='sm'
            variant='outline'
            onClick={() => {
              setPage(1)
              setAppliedModel(modelFilter)
            }}
          >
            {t('Apply')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className='p-0'>
        {rows.length === 0 ? (
          <EmptyState
            title={t('No facts retained yet')}
            description={t(
              'Facts appear here after relay requests settle while provider memory is enabled.'
            )}
          />
        ) : (
          <StaticDataTable tableClassName='min-w-[880px]'>
            <TableHeader>
              <TableRow className='bg-muted/40 hover:bg-muted/40'>
                <TableHead className='h-9 w-8 px-4 text-xs'></TableHead>
                <TableHead className='h-9 px-4 text-xs'>
                  {t('Channel')}
                </TableHead>
                <TableHead className='h-9 text-xs'>{t('Model')}</TableHead>
                <TableHead className='h-9 text-xs'>{t('Latency')}</TableHead>
                <TableHead className='h-9 text-xs'>{t('Result')}</TableHead>
                <TableHead className='h-9 text-xs'>{t('Entities')}</TableHead>
                <TableHead className='h-9 pr-4 text-xs'>
                  {t('Retained')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((f) => {
                const latency = parseMetric(f.metrics, 'latency_ms')
                const isExpanded = expandedId === f.id
                return (
                  <>
                    <TableRow
                      key={f.id}
                      className='hover:bg-muted/30 cursor-pointer'
                      onClick={() => setExpandedId(isExpanded ? null : f.id)}
                    >
                      <TableCell className='px-4 py-2.5'>
                        {isExpanded ? (
                          <ChevronDown className='size-4' />
                        ) : (
                          <ChevronRight className='size-4' />
                        )}
                      </TableCell>
                      <TableCell className='px-4 py-2.5 font-mono text-xs'>
                        #{f.channel_id}
                        <span className='text-muted-foreground'>
                          {' '}
                          (t{f.channel_type})
                        </span>
                      </TableCell>
                      <TableCell className='py-2.5 text-sm'>
                        {f.model_name}
                      </TableCell>
                      <TableCell className='py-2.5 font-mono text-xs tabular-nums'>
                        {latency === null ? '-' : `${latency} ms`}
                      </TableCell>
                      <TableCell className='py-2.5'>
                        <Badge
                          variant='secondary'
                          className={cn(
                            f.success
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                              : 'bg-destructive/10 text-destructive'
                          )}
                        >
                          {f.success ? t('Success') : t('Failure')}
                        </Badge>
                      </TableCell>
                      <TableCell className='text-muted-foreground max-w-[200px] truncate py-2.5 text-xs'>
                        {f.entities || '-'}
                      </TableCell>
                      <TableCell
                        className='text-muted-foreground py-2.5 pr-4 text-xs whitespace-nowrap'
                        title={new Date(f.retained_at * 1000).toISOString()}
                      >
                        {formatTimestampRelative(
                          f.retained_at,
                          'seconds',
                          toIntlLocale(i18n.language)
                        )}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`detail-${f.id}`} className='bg-muted/20'>
                        <TableCell colSpan={7} className='px-4 py-3'>
                          <FactDetail f={f} />
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                )
              })}
            </TableBody>
          </StaticDataTable>
        )}
        <div className='flex items-center justify-between border-t px-4 py-2'>
          <span className='text-muted-foreground text-xs'>
            {t('Page {{page}}', { page })}
          </span>
          <div className='flex gap-2'>
            <Button
              size='sm'
              variant='outline'
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              {t('Previous')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              onClick={() => setPage((p) => p + 1)}
              disabled={rows.length < PAGE_SIZE}
            >
              {t('Next')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// --- Fact detail (expanded row) ---

function formatMetricValue(key: string, value: unknown): string {
  if (typeof value !== 'number') {
    return String(value)
  }
  if (key.includes('rate')) {
    return `${(value * 100).toFixed(2)}%`
  }
  if (key.includes('latency')) {
    return `${value}ms`
  }
  return String(value)
}

function FactDetail({ f }: { f: import('../api').ProviderMemoryFact }) {
  const { t } = useTranslation()

  let metrics: Record<string, unknown> = {}
  try {
    metrics = JSON.parse(f.metrics)
  } catch {
    // keep empty
  }

  const keywords = f.keywords ? f.keywords.split(/\s+/).filter(Boolean) : []
  const entities = f.entities
    ? f.entities
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean)
    : []

  return (
    <div className='space-y-3'>
      {/* Full metrics breakdown */}
      <div className='grid gap-4 sm:grid-cols-2'>
        <div>
          <h4 className='text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase'>
            {t('Metrics')}
          </h4>
          <div className='space-y-1 text-sm'>
            {Object.entries(metrics).map(([key, value]) => (
              <div key={key} className='flex justify-between gap-4'>
                <span className='text-muted-foreground font-mono text-xs'>
                  {key}
                </span>
                <span className='font-mono text-xs tabular-nums'>
                  {formatMetricValue(key, value)}
                </span>
              </div>
            ))}
            {Object.keys(metrics).length === 0 && (
              <span className='text-muted-foreground text-xs'>
                {t('No metrics available')}
              </span>
            )}
          </div>
        </div>

        {/* Provenance */}
        <div>
          <h4 className='text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase'>
            {t('Provenance')}
          </h4>
          <div className='space-y-1 text-sm'>
            <div className='flex justify-between gap-4'>
              <span className='text-muted-foreground text-xs'>
                {t('Fact ID')}
              </span>
              <span className='font-mono text-xs'>#{f.id}</span>
            </div>
            <div className='flex justify-between gap-4'>
              <span className='text-muted-foreground text-xs'>
                {t('Channel type')}
              </span>
              <span className='font-mono text-xs'>type {f.channel_type}</span>
            </div>
            <div className='flex justify-between gap-4'>
              <span className='text-muted-foreground text-xs'>
                {t('Language')}
              </span>
              <span className='font-mono text-xs'>{f.language || '—'}</span>
            </div>
            <div className='flex justify-between gap-4'>
              <span className='text-muted-foreground text-xs'>
                {t('Success')}
              </span>
              <span className='font-mono text-xs'>{f.success ? '✓' : '✗'}</span>
            </div>
            <div className='flex justify-between gap-4'>
              <span className='text-muted-foreground text-xs'>
                {t('Retained at')}
              </span>
              <span className='text-xs'>
                {new Date(f.retained_at * 1000).toLocaleString()}
              </span>
            </div>
            <div className='flex justify-between gap-4'>
              <span className='text-muted-foreground text-xs'>
                {t('Created at')}
              </span>
              <span className='text-xs'>
                {new Date(f.created_at * 1000).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Entities */}
      {entities.length > 0 && (
        <div>
          <h4 className='text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase'>
            {t('Entities (graph nodes)')}
          </h4>
          <div className='flex flex-wrap gap-1.5'>
            {entities.map((e) => (
              <Badge key={e} variant='outline' className='text-xs'>
                {e}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Keywords (BM25-lite index) */}
      {keywords.length > 0 && (
        <div>
          <h4 className='text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase'>
            {t('Keywords (BM25-lite index)')}
          </h4>
          <div className='flex flex-wrap gap-1'>
            {keywords.map((kw) => (
              <span
                key={kw}
                className='bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-xs'
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Raw metrics JSON */}
      <div>
        <h4 className='text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase'>
          {t('Raw metrics JSON')}
        </h4>
        <pre className='bg-muted overflow-x-auto rounded-lg p-3 text-xs'>
          {JSON.stringify(metrics, null, 2)}
        </pre>
      </div>
    </div>
  )
}
