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
import { toast } from 'sonner'
import { useState } from 'react'
import dayjs from 'dayjs'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

import { useProviderMemoryConfig, useUpdateProviderMemoryConfig } from '../hooks'

export function MemoryConfigSection() {
  const { t } = useTranslation()
  const { data, isLoading } = useProviderMemoryConfig()
  const update = useUpdateProviderMemoryConfig()

  const [enabled, setEnabled] = useState(false)
  const [interval, setInterval] = useState(300)
  const [retention, setRetention] = useState(168)
  const [minFacts, setMinFacts] = useState(5)

  // Sync state when data loads
  if (data && !isLoading) {
    if (data.enabled !== enabled) setEnabled(data.enabled)
    if (data.consolidate_interval_s !== interval)
      setInterval(data.consolidate_interval_s)
    if (data.retention_hours !== retention) setRetention(data.retention_hours)
    if (data.min_facts !== minFacts) setMinFacts(data.min_facts)
  }

  function handleSave() {
    update.mutate({
      enabled,
      consolidate_interval_sec: interval,
      retention_hours: retention,
      min_facts: minFacts,
    })
  }

  function handleConsolidateNow() {
    toast.info(t('Consolidation runs automatically. Use the Actions bar above.'))
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className='h-5 w-40' />
        </CardHeader>
        <CardContent>
          <Skeleton className='h-40 w-full' />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Provider Memory Configuration')}</CardTitle>
      </CardHeader>
      <CardContent className='space-y-6'>
        <div className='flex items-center justify-between'>
          <div className='space-y-0.5'>
            <Label htmlFor='pm-enabled'>{t('Enable provider memory')}</Label>
            <p className='text-muted-foreground text-sm'>
              {t(
                'When enabled, facts are retained after each relay and consolidated into observations periodically.'
              )}
            </p>
          </div>
          <Switch
            id='pm-enabled'
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        <div className='grid gap-4 sm:grid-cols-3'>
          <div className='space-y-2'>
            <Label htmlFor='pm-interval'>
              {t('Consolidation interval (sec)')}
            </Label>
            <Input
              id='pm-interval'
              type='number'
              min={60}
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='pm-retention'>
              {t('Retention (hours)')}
            </Label>
            <Input
              id='pm-retention'
              type='number'
              min={1}
              value={retention}
              onChange={(e) => setRetention(Number(e.target.value))}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='pm-min-facts'>
              {t('Min facts to consolidate')}
            </Label>
            <Input
              id='pm-min-facts'
              type='number'
              min={1}
              value={minFacts}
              onChange={(e) => setMinFacts(Number(e.target.value))}
            />
          </div>
        </div>

        <div className='flex items-center gap-3'>
          <Button onClick={handleSave} disabled={update.isPending}>
            {t('Save configuration')}
          </Button>
          <span className='text-muted-foreground text-xs'>
            {data
              ? t('Last loaded: {{time}}', {
                  time: dayjs().format('HH:mm:ss'),
                })
              : ''}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

import { Skeleton } from '@/components/ui/skeleton'