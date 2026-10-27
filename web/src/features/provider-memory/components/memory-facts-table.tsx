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
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className='h-9 w-full' />
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
        <CardTitle>{t('Raw facts ({{count}})', { count: rows.length })}</CardTitle>
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
                <TableHead className='h-9 px-4 text-xs'>{t('Channel')}</TableHead>
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
                return (
                  <TableRow key={f.id} className='hover:bg-muted/30'>
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