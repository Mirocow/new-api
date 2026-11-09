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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, Brain, Database, Search, Sparkles, Copy, Check } from 'lucide-react'

import {
  retainMemory,
  recallMemory,
  reflectMemory,
  consolidateMemory,
  type MemoryRetainRequest,
  type MemoryRecallRequest,
  type MemoryRecallResponse,
  type MemoryReflectRequest,
  type MemoryReflectResponse,
} from '../api'

interface RetainRecallReflectTabProps {
  bankId: number
}

export function RetainRecallReflectTab({ bankId }: RetainRecallReflectTabProps) {
  const { t } = useTranslation()

  // Retain state
  const [retainText, setRetainText] = useState('')
  const [retainRole, setRetainRole] = useState('user')
  const [retainLanguage, setRetainLanguage] = useState('')
  const [retainLoading, setRetainLoading] = useState(false)
  const [retainResult, setRetainResult] = useState<string | null>(null)

  // Recall state
  const [recallQuery, setRecallQuery] = useState('')
  const [recallEntities, setRecallEntities] = useState('')
  const [recallLanguage, setRecallLanguage] = useState('')
  const [recallSince, setRecallSince] = useState('')
  const [recallUntil, setRecallUntil] = useState('')
  const [recallLimit, setRecallLimit] = useState(10)
  const [recallLoading, setRecallLoading] = useState(false)
  const [recallResult, setRecallResult] = useState<MemoryRecallResponse | null>(null)

  // Reflect state
  const [reflectQuestion, setReflectQuestion] = useState('')
  const [reflectContext, setReflectContext] = useState('')
  const [reflectLanguage, setReflectLanguage] = useState('')
  const [reflectLoading, setReflectLoading] = useState(false)
  const [reflectResult, setReflectResult] = useState<MemoryReflectResponse | null>(null)

  // Consolidate state
  const [consolidateLoading, setConsolidateLoading] = useState(false)
  const [consolidateResult, setConsolidateResult] = useState<string | null>(null)

  const handleRetain = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!retainText.trim()) return
    setRetainLoading(true)
    setRetainResult(null)
    try {
      const response = await retainMemory({
        bank_id: bankId,
        text: retainText,
        role: retainRole,
        language: retainLanguage || undefined,
      })
      setRetainResult(t('Successfully retained {count} fact(s)', { count: response.facts_retained }))
      setRetainText('')
    } catch (err) {
      setRetainResult(t('Error: {error}', { error: String(err) }))
    } finally {
      setRetainLoading(false)
    }
  }

  const handleRecall = async (e: React.FormEvent) => {
    e.preventDefault()
    setRecallLoading(true)
    setRecallResult(null)
    try {
      const request: MemoryRecallRequest = {
        bank_id: bankId,
        limit: recallLimit,
      }
      if (recallQuery.trim()) request.query = recallQuery
      if (recallEntities.trim()) request.entities = recallEntities.split(',').map(e => e.trim()).filter(Boolean)
      if (recallLanguage.trim()) request.language = recallLanguage
      if (recallSince.trim()) request.since = parseInt(recallSince, 10)
      if (recallUntil.trim()) request.until = parseInt(recallUntil, 10)

      const response = await recallMemory(request)
      setRecallResult(response)
    } catch (err) {
      console.error(err)
    } finally {
      setRecallLoading(false)
    }
  }

  const handleReflect = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reflectQuestion.trim()) return
    setReflectLoading(true)
    setReflectResult(null)
    try {
      const response = await reflectMemory({
        bank_id: bankId,
        question: reflectQuestion,
        context: reflectContext || undefined,
        language: reflectLanguage || undefined,
      })
      setReflectResult(response)
    } catch (err) {
      console.error(err)
    } finally {
      setReflectLoading(false)
    }
  }

  const handleConsolidate = async () => {
    setConsolidateLoading(true)
    setConsolidateResult(null)
    try {
      await consolidateMemory(bankId)
      setConsolidateResult(t('Consolidation completed successfully'))
    } catch (err) {
      setConsolidateResult(t('Error: {error}', { error: String(err) }))
    } finally {
      setConsolidateLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <Tabs defaultValue='retain' className='space-y-4'>
      <TabsList className='grid w-full grid-cols-4'>
        <TabsTrigger value='retain'>
          <Database className='mr-2 size-4' aria-hidden='true' />
          {t('Retain')}
        </TabsTrigger>
        <TabsTrigger value='recall'>
          <Search className='mr-2 size-4' aria-hidden='true' />
          {t('Recall')}
        </TabsTrigger>
        <TabsTrigger value='reflect'>
          <Brain className='mr-2 size-4' aria-hidden='true' />
          {t('Reflect')}
        </TabsTrigger>
        <TabsTrigger value='consolidate'>
          <Sparkles className='mr-2 size-4' aria-hidden='true' />
          {t('Consolidate')}
        </TabsTrigger>
      </TabsList>

      {/* Retain Tab */}
      <TabsContent value='retain'>
        <Card>
          <CardHeader>
            <CardTitle>{t('Retain Facts from Text')}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <form onSubmit={handleRetain} className='space-y-4'>
              <div className='space-y-2'>
                <label className='text-sm font-medium'>{t('Text to Retain')}</label>
                <Textarea
                  value={retainText}
                  onChange={(e) => setRetainText(e.target.value)}
                  placeholder={t('Enter text to extract facts from...')}
                  rows={6}
                />
              </div>
              <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                <div className='space-y-2'>
                  <label className='text-sm font-medium'>{t('Role')}</label>
                  <Select value={retainRole} onValueChange={setRetainRole}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('Select role')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='user'>{t('User')}</SelectItem>
                      <SelectItem value='assistant'>{t('Assistant')}</SelectItem>
                      <SelectItem value='system'>{t('System')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className='space-y-2'>
                  <label className='text-sm font-medium'>{t('Language (optional)')}</label>
                  <Input
                    value={retainLanguage}
                    onChange={(e) => setRetainLanguage(e.target.value)}
                    placeholder={t('e.g., en, zh, ja')}
                  />
                </div>
              </div>
              <Button type='submit' disabled={retainLoading || !retainText.trim()}>
                {retainLoading ? (
                  <>
                    <Loader2 className='mr-2 size-4 animate-spin' aria-hidden='true' />
                    {t('Retaining...')}
                  </>
                ) : (
                  <>
                    <Database className='mr-2 size-4' aria-hidden='true' />
                    {t('Retain Facts')}
                  </>
                )}
              </Button>
            </form>

            {retainResult && (
              <div className='p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'>
                {retainResult}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Recall Tab */}
      <TabsContent value='recall'>
        <Card>
          <CardHeader>
            <CardTitle>{t('Recall Memories')}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <form onSubmit={handleRecall} className='space-y-4'>
              <div className='space-y-2'>
                <label className='text-sm font-medium'>{t('Query (optional)')}</label>
                <Input
                  value={recallQuery}
                  onChange={(e) => setRecallQuery(e.target.value)}
                  placeholder={t('Keywords or question to search for...')}
                />
              </div>
              <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                <div className='space-y-2'>
                  <label className='text-sm font-medium'>{t('Entities (comma-separated)')}</label>
                  <Input
                    value={recallEntities}
                    onChange={(e) => setRecallEntities(e.target.value)}
                    placeholder={t('e.g., coding, python, api')}
                  />
                </div>
                <div className='space-y-2'>
                  <label className='text-sm font-medium'>{t('Language')}</label>
                  <Input
                    value={recallLanguage}
                    onChange={(e) => setRecallLanguage(e.target.value)}
                    placeholder={t('e.g., en, zh, ja')}
                  />
                </div>
                <div className='space-y-2'>
                  <label className='text-sm font-medium'>{t('Limit')}</label>
                  <Input
                    type='number'
                    value={recallLimit}
                    onChange={(e) => setRecallLimit(parseInt(e.target.value, 10) || 10)}
                    className='w-24'
                  />
                </div>
              </div>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <div className='space-y-2'>
                  <label className='text-sm font-medium'>{t('Since (unix timestamp)')}</label>
                  <Input
                    type='number'
                    value={recallSince}
                    onChange={(e) => setRecallSince(e.target.value)}
                    placeholder={t('Optional')}
                  />
                </div>
                <div className='space-y-2'>
                  <label className='text-sm font-medium'>{t('Until (unix timestamp)')}</label>
                  <Input
                    type='number'
                    value={recallUntil}
                    onChange={(e) => setRecallUntil(e.target.value)}
                    placeholder={t('Optional')}
                  />
                </div>
              </div>
              <Button type='submit' disabled={recallLoading}>
                {recallLoading ? (
                  <>
                    <Loader2 className='mr-2 size-4 animate-spin' aria-hidden='true' />
                    {t('Recalling...')}
                  </>
                ) : (
                  <>
                    <Search className='mr-2 size-4' aria-hidden='true' />
                    {t('Recall')}
                  </>
                )}
              </Button>
            </form>

            {recallResult && (
              <div className='space-y-4'>
                <div className='flex items-center justify-between'>
                  <h4 className='font-medium'>{t('Results')}</h4>
                  <Button variant='ghost' size='sm' onClick={() => copyToClipboard(JSON.stringify(recallResult, null, 2))}>
                    <Copy className='mr-1 size-3' aria-hidden='true' />
                    {t('Copy JSON')}
                  </Button>
                </div>
                <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                  <Card>
                    <CardHeader>
                      <CardTitle>{t('Facts')} ({recallResult.facts.length})</CardTitle>
                    </CardHeader>
                    <CardContent className='max-h-64 overflow-auto space-y-2'>
                      {recallResult.facts.length === 0 ? (
                        <p className='text-sm text-muted-foreground'>{t('No facts found')}</p>
                      ) : (
                        recallResult.facts.map((fact) => (
                          <div key={fact.id} className='p-2 bg-muted rounded text-sm border'>
                            <p>{fact.content}</p>
                            <div className='text-xs text-muted-foreground mt-1'>
                              {t('Confidence')}: {Math.round(fact.confidence * 100)}%
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>{t('Observations')} ({recallResult.observations.length})</CardTitle>
                    </CardHeader>
                    <CardContent className='max-h-64 overflow-auto space-y-2'>
                      {recallResult.observations.length === 0 ? (
                        <p className='text-sm text-muted-foreground'>{t('No observations found')}</p>
                      ) : (
                        recallResult.observations.map((obs) => (
                          <div key={obs.id} className='p-2 bg-muted rounded text-sm border'>
                            <p>{obs.summary}</p>
                            <div className='text-xs text-muted-foreground mt-1'>
                              {t('Confidence')}: {Math.round(obs.confidence * 100)}%
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>{t('Mental Models')} ({recallResult.mental_models.length})</CardTitle>
                    </CardHeader>
                    <CardContent className='max-h-64 overflow-auto space-y-2'>
                      {recallResult.mental_models.length === 0 ? (
                        <p className='text-sm text-muted-foreground'>{t('No mental models found')}</p>
                      ) : (
                        recallResult.mental_models.map((mm) => (
                          <div key={mm.id} className='p-2 bg-muted rounded text-sm border'>
                            <p className='font-medium'>{mm.scope_model || t('General')}</p>
                            <p className='text-xs text-muted-foreground mt-1'>{mm.content}</p>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Reflect Tab */}
      <TabsContent value='reflect'>
        <Card>
          <CardHeader>
            <CardTitle>{t('Reflect on Memories')}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <form onSubmit={handleReflect} className='space-y-4'>
              <div className='space-y-2'>
                <label className='text-sm font-medium'>{t('Question')}</label>
                <Textarea
                  value={reflectQuestion}
                  onChange={(e) => setReflectQuestion(e.target.value)}
                  placeholder={t('Ask a question about the memories...')}
                  rows={3}
                />
              </div>
              <div className='space-y-2'>
                <label className='text-sm font-medium'>{t('Additional Context (optional)')}</label>
                <Textarea
                  value={reflectContext}
                  onChange={(e) => setReflectContext(e.target.value)}
                  placeholder={t('Additional context to help with reasoning...')}
                  rows={3}
                />
              </div>
              <div className='space-y-2'>
                <label className='text-sm font-medium'>{t('Language (optional)')}</label>
                <Input
                  value={reflectLanguage}
                  onChange={(e) => setReflectLanguage(e.target.value)}
                  placeholder={t('e.g., en, zh, ja')}
                />
              </div>
              <Button type='submit' disabled={reflectLoading || !reflectQuestion.trim()}>
                {reflectLoading ? (
                  <>
                    <Loader2 className='mr-2 size-4 animate-spin' aria-hidden='true' />
                    {t('Reflecting...')}
                  </>
                ) : (
                  <>
                    <Brain className='mr-2 size-4' aria-hidden='true' />
                    {t('Reflect')}
                  </>
                )}
              </Button>
            </form>

            {reflectResult && (
              <div className='space-y-4'>
                <div className='flex items-center justify-between'>
                  <h4 className='font-medium'>{t('Answer')}</h4>
                  <Button variant='ghost' size='sm' onClick={() => copyToClipboard(reflectResult.answer)}>
                    <Copy className='mr-1 size-3' aria-hidden='true' />
                    {t('Copy Answer')}
                  </Button>
                </div>
                <div className='p-4 bg-muted rounded border'>
                  <p className='whitespace-pre-wrap'>{reflectResult.answer}</p>
                </div>
                <div className='flex items-center gap-4 text-sm text-muted-foreground'>
                  <span>{t('Facts Used')}: {reflectResult.facts_used}</span>
                  <span>{t('Fact IDs')}: {reflectResult.fact_ids.join(', ')}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Consolidate Tab */}
      <TabsContent value='consolidate'>
        <Card>
          <CardHeader>
            <CardTitle>{t('Consolidate Observations')}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='space-y-4'>
              <p className='text-sm text-muted-foreground'>
                {t('Consolidation aggregates recent facts into observations and refreshes mental models. This runs automatically on a schedule, but you can trigger it manually here.')}
              </p>
              <Button onClick={handleConsolidate} disabled={consolidateLoading}>
                {consolidateLoading ? (
                  <>
                    <Loader2 className='mr-2 size-4 animate-spin' aria-hidden='true' />
                    {t('Consolidating...')}
                  </>
                ) : (
                  <>
                    <Sparkles className='mr-2 size-4' aria-hidden='true' />
                    {t('Run Consolidation Now')}
                  </>
                )}
              </Button>

              {consolidateResult && (
                <div className='p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'>
                  {consolidateResult}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}