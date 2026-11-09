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
import { Search, Loader2, RefreshCw, Brain } from 'lucide-react'

import {
  recallMemory,
  type MemoryMentalModel,
  type MemoryRecallRequest,
} from '../api'

interface MemoryMentalModelsTabProps {
  bankId: number
}

export function MemoryMentalModelsTab({ bankId }: MemoryMentalModelsTabProps) {
  const { t } = useTranslation()
  const [mentalModels, setMentalModels] = useState<MemoryMentalModel[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(20)

  const loadMentalModels = async () => {
    setLoading(true)
    try {
      const request: MemoryRecallRequest = {
        bank_id: bankId,
        limit,
      }
      if (query.trim()) request.query = query

      const response = await recallMemory(request)
      setMentalModels(response.mental_models)
    } catch {
      // Error handled by api layer
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMentalModels()
  }, [bankId])

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString()
  }

  return (
    <div className='space-y-4'>
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center justify-between'>
            {t('Filters')}
            <Button variant='outline' size='sm' onClick={loadMentalModels} disabled={loading}>
              <Search className='mr-2 size-4' aria-hidden='true' />
              {t('Search')}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
            <Input
              placeholder={t('Query (source query keywords)')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadMentalModels()}
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

      {/* Mental Models List */}
      <Card>
        <CardHeader>
          <div className='flex items-center justify-between'>
            <CardTitle className='flex items-center gap-2'>
              <Brain className='size-4' aria-hidden='true' />
              {t('Mental Models')} ({mentalModels.length})
            </CardTitle>
            <Button variant='outline' size='sm' onClick={loadMentalModels} disabled={loading}>
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
          ) : mentalModels.length === 0 ? (
            <p className='text-sm text-muted-foreground text-center py-8'>
              {t('No mental models found. Mental models are created during consolidation or can be added manually.')}
            </p>
          ) : (
            <ScrollArea className='h-[500px]'>
              <div className='space-y-3'>
                {mentalModels.map((mm) => (
                  <Card key={mm.id} className='border-none bg-transparent p-3'>
                    <CardContent className='p-3 space-y-2'>
                      <div className='flex items-start justify-between gap-4'>
                        <div className='flex-1 min-w-0 space-y-2'>
                          <div className='flex items-center gap-2 flex-wrap'>
                            <span className='font-medium text-sm'>{mm.scope_model || t('General')}</span>
                            {mm.auto_refresh && (
                              <Badge variant='default' className='text-xs'>
                                {t('Auto Refresh')}
                              </Badge>
                            )}
                          </div>
                          {mm.source_query && (
                            <p className='text-xs text-muted-foreground'>
                              {t('Source Query')}: {mm.source_query}
                            </p>
                          )}
                          <p className='text-sm'>{mm.content}</p>
                          {mm.payload && (
                            <details className='text-xs text-muted-foreground'>
                              <summary className='cursor-pointer'>{t('Payload')}</summary>
                              <pre className='mt-1 p-2 bg-muted rounded text-xs overflow-auto'>{mm.payload}</pre>
                            </details>
                          )}
                          {mm.tags && (
                            <div className='flex items-center gap-2 flex-wrap'>
                              {mm.tags.split(',').map((tag) => (
                                <Badge key={tag} variant='outline' className='text-xs'>
                                  {tag.trim()}
                                </Badge>
                              ))}
                            </div>
                          )}
                          <div className='text-xs text-muted-foreground'>
                            {t('Refreshed')}: {formatDate(mm.refreshed_at)} | {t('Created')}: {formatDate(mm.created_at)} | {t('ID')}: {mm.id}
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