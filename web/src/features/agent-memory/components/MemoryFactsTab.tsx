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
import { Plus, Trash2, Search, Filter, Loader2 } from 'lucide-react'

import {
  recallMemory,
  type MemoryFact,
  type MemoryRecallRequest,
} from '../api'

interface MemoryFactsTabProps {
  bankId: number
}

export function MemoryFactsTab({ bankId }: MemoryFactsTabProps) {
  const { t } = useTranslation()
  const [facts, setFacts] = useState<MemoryFact[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [entities, setEntities] = useState('')
  const [limit, setLimit] = useState(50)
  const [since, setSince] = useState('')

  const loadFacts = async () => {
    setLoading(true)
    try {
      const request: MemoryRecallRequest = {
        bank_id: bankId,
        limit,
      }
      if (query.trim()) request.query = query
      if (entities.trim()) request.entities = entities.split(',').map(e => e.trim()).filter(Boolean)
      if (since.trim()) request.since = parseInt(since, 10)

      const response = await recallMemory(request)
      setFacts(response.facts)
    } catch {
      // Error handled by api layer
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFacts()
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
            <Button variant='outline' size='sm' onClick={loadFacts} disabled={loading}>
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
              onKeyDown={(e) => e.key === 'Enter' && loadFacts()}
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
              onChange={(e) => setLimit(parseInt(e.target.value, 10) || 50)}
              className='w-24'
            />
            <Input
              type='number'
              placeholder={t('Since (unix timestamp)')}
              value={since}
              onChange={(e) => setSince(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Facts List */}
      <Card>
        <CardHeader>
          <CardTitle>{t('Facts')} ({facts.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className='flex items-center justify-center py-8'>
              <Loader2 className='animate-spin size-6' aria-hidden='true' />
              <span className='ml-2 text-muted-foreground'>{t('Loading...')}</span>
            </div>
          ) : facts.length === 0 ? (
            <p className='text-sm text-muted-foreground text-center py-8'>
              {t('No facts found. Try adjusting your filters or use the Tools tab to retain new facts.')}
            </p>
          ) : (
            <ScrollArea className='h-[500px]'>
              <div className='space-y-3'>
                {facts.map((fact) => (
                  <Card key={fact.id} className='border-none bg-transparent p-3'>
                    <CardContent className='p-3 space-y-2'>
                      <div className='flex items-start justify-between gap-4'>
                        <div className='flex-1 min-w-0'>
                          <p className='text-sm'>{fact.content}</p>
                          <div className='flex items-center gap-2 mt-1 flex-wrap'>
                            {fact.entities && (
                              <Badge variant='secondary' className='text-xs'>
                                {t('Entities')}: {fact.entities}
                              </Badge>
                            )}
                            {fact.keywords && (
                              <Badge variant='outline' className='text-xs'>
                                {t('Keywords')}: {fact.keywords}
                              </Badge>
                            )}
                            {fact.language && (
                              <Badge variant='outline' className='text-xs'>
                                {t('Language')}: {fact.language}
                              </Badge>
                            )}
                            <Badge variant='default' className='text-xs'>
                              {t('Confidence')}: {formatConfidence(fact.confidence)}
                            </Badge>
                          </div>
                          <div className='text-xs text-muted-foreground mt-1'>
                            {t('Retained')}: {formatDate(fact.retained_at)} | {t('ID')}: {fact.id}
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