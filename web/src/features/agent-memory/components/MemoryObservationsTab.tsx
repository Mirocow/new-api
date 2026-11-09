/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see
<https://www.gnu.org/licenses/>.
*/
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search, Loader2, RefreshCw } from 'lucide-react'

import {
  recallMemory,
  type MemoryObservation,
  type MemoryRecallRequest,
} from '../api'

interface MemoryObservationsTabProps {
  bankId: number
}

export function MemoryObservationsTab({ bankId }: MemoryObservationsTabProps) {
  const { t } = useTranslation()
  const [observations, setObservations] = useState<MemoryObservation[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [entities, setEntities] = useState('')
  const [limit, setLimit] = useState(20)

  const loadObservations = async () => {
    setLoading(true)
    try {
      const request: MemoryRecallRequest = {
        bank_id: bankId,
        limit,
      }
      if (query.trim()) request.query = query
      if (entities.trim()) request.entities = entities.split(',').map(e => e.trim()).filter(Boolean)

      const response = await recallMemory(request)
      setObservations(response.observations)
    } catch {
      // Error handled by api layer
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadObservations()
  }, [bankId])

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString()
  }

  const formatConfidence = (confidence: number) => {
    return `${Math.round(confidence * 100)}%`
  }

  return (
    <div className='space-y-4'>
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center justify-between'>
            {t('Filters')}
            <Button variant='outline' size='sm' onClick={loadObservations} disabled={loading}>
              <Search className='mr-2 size-4' aria-hidden='true' />
              {t('Search')}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
            <Input
              placeholder={t('Query (keywords)')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadObservations()}
            />
            <Input
              placeholder={t('Entities (comma-separated)')}
              value={entities}
              onChange={(e) => setEntities(e.target.value)}
            />
            <Input
              type='number'
              placeholder={t('Limit')}
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value, 10) || 20)}
              className='w-24'
            />
          </div>
        </CardContent>
      </Card>

      {/* Observations List */}
      <Card>
        <CardHeader>
          <div className='flex items-center justify-between'>
            <CardTitle>{t('Observations')} ({observations.length})</CardTitle>
            <Button variant='outline' size='sm' onClick={loadObservations} disabled={loading}>
              <RefreshCw className='mr-2 size-4' aria-hidden='true' />
              {t('Refresh')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className='flex items-center justify-center py-8'>
              <Loader2 className='animate-spin size-6' aria-hidden='true' />
              <span className='ml-2 text-muted-foreground'>{t('Loading...')}</span>
            </div>
          ) : observations.length === 0 ? (
            <p className='text-sm text-muted-foreground text-center py-8'>
              {t('No observations found. Observations are created automatically during consolidation.')}
            </p>
          ) : (
            <ScrollArea className='h-[500px]'>
              <div className='space-y-3'>
                {observations.map((obs) => (
                  <Card key={obs.id} className='border-none bg-transparent p-3'>
                    <CardContent className='p-3 space-y-2'>
                      <div className='flex items-start justify-between gap-4'>
                        <div className='flex-1 min-w-0'>
                          <p className='text-sm'>{obs.summary}</p>
                          <div className='flex items-center gap-2 mt-1 flex-wrap'>
                            {obs.entities && (
                              <Badge variant='secondary' className='text-xs'>
                                {t('Entities')}: {obs.entities}
                              </Badge>
                            )}
                            {obs.keywords && (
                              <Badge variant='outline' className='text-xs'>
                                {t('Keywords')}: {obs.keywords}
                              </Badge>
                            )}
                            <Badge variant='default' className='text-xs'>
                              {t('Confidence')}: {formatConfidence(obs.confidence)}
                            </Badge>
                            <Badge variant='outline' className='text-xs'>
                              {t('Sample Size')}: {obs.sample_size}
                            </Badge>
                          </div>
                          <div className='text-xs text-muted-foreground mt-1'>
                            {t('Window')}: {formatDate(obs.window_start)} — {formatDate(obs.window_end)}
                            {obs.superseded_by ? ` | {t('Superseded by')}: ${obs.superseded_by}` : ''}
                            | {t('ID')}: {obs.id}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}