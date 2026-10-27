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
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

import { useProviderObservations } from '../hooks'

function confidenceColor(c: number): string {
  if (c >= 0.8)
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
  if (c >= 0.5)
    return 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
  return 'bg-muted text-muted-foreground'
}

export function MemoryObservationsTable() {
  const { t, i18n } = useTranslation()
  const { data, isLoading, isError } = useProviderObservations({
    page: 1,
    page_size: 50,
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
          {t('Failed to load observations')}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('Active observations ({{count}})', { count: rows.length })}
        </CardTitle>
      </CardHeader>
      <CardContent className='p-0'>
        {rows.length === 0 ? (
          <EmptyState
            title={t('No observations yet')}
            description={t(
              'Observations are produced by the background consolidation job when enough facts accumulate.'
            )}
          />
        ) : (
          <StaticDataTable tableClassName='min-w-[900px]'>
            <TableHeader>
              <TableRow className='bg-muted/40 hover:bg-muted/40'>
                <TableHead className='h-9 px-4 text-xs'>
                  {t('Channel')}
                </TableHead>
                <TableHead className='h-9 text-xs'>{t('Model')}</TableHead>
                <TableHead className='h-9 text-xs'>
                  {t('Sample size')}
                </TableHead>
                <TableHead className='h-9 text-xs'>
                  {t('Confidence')}
                </TableHead>
                <TableHead className='h-9 text-xs'>{t('Summary')}</TableHead>
                <TableHead className='h-9 pr-4 text-xs'>
                  {t('Created')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => (
                <TableRow key={o.id} className='hover:bg-muted/30'>
                  <TableCell className='px-4 py-2.5 font-mono text-xs'>
                    #{o.channel_id}
                  </TableCell>
                  <TableCell className='py-2.5 text-sm'>
                    {o.model_name}
                  </TableCell>
                  <TableCell className='py-2.5 font-mono text-xs tabular-nums'>
                    {o.sample_size}
                  </TableCell>
                  <TableCell className='py-2.5'>
                    <Badge
                      variant='secondary'
                      className={cn(confidenceColor(o.confidence))}
                    >
                      {(o.confidence * 100).toFixed(0)}%
                    </Badge>
                  </TableCell>
                  <TableCell className='text-muted-foreground max-w-[320px] truncate py-2.5 text-xs'>
                    {o.summary}
                  </TableCell>
                  <TableCell
                    className='text-muted-foreground py-2.5 pr-4 text-xs whitespace-nowrap'
                    title={new Date(o.created_at * 1000).toISOString()}
                  >
                    {formatTimestampRelative(
                      o.created_at,
                      'seconds',
                      toIntlLocale(i18n.language)
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </StaticDataTable>
        )}
      </CardContent>
    </Card>
  )
}