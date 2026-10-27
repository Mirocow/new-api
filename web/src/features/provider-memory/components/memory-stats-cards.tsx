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
import { Brain, Database, Eye, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import { useProviderMemoryStats } from '../hooks'
import type { ProviderMemoryStats } from '../api'

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: number | string
  accent?: string
}

function StatCard({ icon: Icon, label, value, accent }: StatCardProps) {
  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
        <CardTitle className='text-muted-foreground text-sm font-medium'>
          {label}
        </CardTitle>
        <span
          className={cn(
            'inline-flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground',
            accent
          )}
        >
          <Icon className='size-4' aria-hidden='true' />
        </span>
      </CardHeader>
      <CardContent>
        <div className='text-2xl font-bold tabular-nums'>{value}</div>
      </CardContent>
    </Card>
  )
}

function StatsSkeleton() {
  return (
    <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className='pb-2'>
            <Skeleton className='h-4 w-24' />
          </CardHeader>
          <CardContent>
            <Skeleton className='h-8 w-16' />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function statusAccent(stats: ProviderMemoryStats): string {
  return stats.enabled
    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
    : 'bg-muted text-muted-foreground'
}

export function MemoryStatsCards() {
  const { t } = useTranslation()
  const { data, isLoading, isError } = useProviderMemoryStats()

  if (isLoading) return <StatsSkeleton />

  if (isError || !data) {
    return (
      <Card>
        <CardContent className='text-muted-foreground py-8 text-center text-sm'>
          {t('Failed to load provider memory statistics')}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
      <StatCard
        icon={Database}
        label={t('Raw facts')}
        value={data.facts_total}
      />
      <StatCard
        icon={Eye}
        label={t('Active observations')}
        value={data.observations_active}
      />
      <StatCard
        icon={Sparkles}
        label={t('Mental models')}
        value={data.mental_models_total}
      />
      <StatCard
        icon={Brain}
        label={data.enabled ? t('Enabled ({{n}} scopes)') : t('Disabled')}
        value={data.distinct_scopes}
        accent={statusAccent(data)}
      />
    </div>
  )
}