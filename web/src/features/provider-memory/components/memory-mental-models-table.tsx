import { ChevronDown, ChevronRight, Plus, Trash2, Info, Sparkles } from 'lucide-react'
/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your Option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toIntlLocale } from '@/i18n/languages'
import { formatTimestampRelative } from '@/lib/format'

import {
  useChannelsForMentalModel,
  useDeleteProviderMentalModel,
  usePreferredModelForChannelType,
  useProviderMentalModels,
  useUpsertProviderMentalModel,
} from '../hooks'
import type { ChannelTypeOption, ModelOption } from '../api'

export function MemoryMentalModelsTable() {
  const { t, i18n } = useTranslation()
  const { data, isLoading, isError } = useProviderMentalModels()
  const { data: channelsData, isLoading: channelsLoading } = useChannelsForMentalModel()
  const upsert = useUpsertProviderMentalModel()
  const del = useDeleteProviderMentalModel()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  // Form state
  const [sourceQuery, setSourceQuery] = useState('')
  const [scopeModel, setScopeModel] = useState('')
  const [selectedChannelType, setSelectedChannelType] = useState<number | null>(null)
  const [content, setContent] = useState('')
  const [payload, setPayload] = useState('[]')
  const [tags, setTags] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)

  // Fetch preferred model when channel type changes
  const { data: preferredModel, isLoading: preferredModelLoading } = usePreferredModelForChannelType(selectedChannelType)

  // Memoize channel types and filtered models
  const channelTypes = useMemo(() => channelsData?.channelTypes ?? [], [channelsData?.channelTypes])
  const models = useMemo(() => channelsData?.models ?? [], [channelsData?.models])
  const filteredModels = useMemo(() => {
    if (!selectedChannelType) return models
    return models.filter(m => m.channelType === selectedChannelType)
  }, [models, selectedChannelType])

  const rows = data?.data ?? []

  function handleSave() {
    upsert.mutate(
      {
        source_query: sourceQuery,
        scope_model: scopeModel,
        content,
        payload,
        tags,
        auto_refresh: autoRefresh,
      },
      {
        onSuccess: () => setDialogOpen(false),
      }
    )
  }

  function handleDelete(sq: string, sm: string) {
    del.mutate({ sourceQuery: sq, scopeModel: sm })
  }

  function resetForm() {
    setSourceQuery('')
    setScopeModel('')
    setSelectedChannelType(null)
    setContent('')
    setPayload('[]')
    setTags('')
    setAutoRefresh(true)
  }

  function handleDialogOpenChange(open: boolean) {
    setDialogOpen(open)
    if (!open) {
      resetForm()
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className='space-y-3 py-4'>
          {[0, 1, 2].map((i) => (
            <div
              key={`mm-skel-${i}`}
              className='bg-muted h-9 w-full animate-pulse rounded'
            />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (isError) {
    return (
      <Card>
        <CardContent className='text-muted-foreground py-8 text-center text-sm'>
          {t('Failed to load mental models')}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between'>
        <CardTitle>
          {t('Mental models ({{count}})', { count: rows.length })}
        </CardTitle>
        <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
          <DialogTrigger asChild>
            <Button size='sm'>
              <Plus className='mr-1 size-4' aria-hidden='true' />
              {t('Add')}
            </Button>
          </DialogTrigger>
          <DialogContent className='sm:max-w-[560px]'>
            <DialogHeader>
              <DialogTitle>{t('Create / Update Mental Model')}</DialogTitle>
              <DialogDescription>
                {t(
                  'Mental models are cached answers to routing queries. The consolidation job auto-refreshes them when auto-refresh is enabled.'
                )}
              </DialogDescription>
            </DialogHeader>
            <div className='grid gap-4 py-4'>
              <div className='grid gap-2'>
                <Label htmlFor='mm-sq'>{t('Source query')}</Label>
                <Input
                  id='mm-sq'
                  placeholder='best channel by latency'
                  value={sourceQuery}
                  onChange={(e) => setSourceQuery(e.target.value)}
                />
              </div>

              {/* Channel Type (Provider) Selector */}
              <div className='grid gap-2'>
                <Label htmlFor='mm-channel-type'>{t('Provider (Channel Type)')}</Label>
                <Select value={selectedChannelType?.toString() ?? ''} onValueChange={(v) => setSelectedChannelType(v ? parseInt(v, 10) : null)}>
                  <SelectTrigger id='mm-channel-type'>
                    <SelectValue placeholder={t('Select a provider')} />
                  </SelectTrigger>
                  <SelectContent>
                    {channelTypes.map((ct) => (
                      <SelectItem key={ct.value} value={ct.value.toString()}>
                        {ct.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Model Selector (filtered by channel type) */}
              <div className='grid gap-2'>
                <Label htmlFor='mm-scope'>{t('Model (Scope)')}</Label>
                <div className='relative'>
                  <Select value={scopeModel} onValueChange={setScopeModel}>
                    <SelectTrigger id='mm-scope'>
                      <SelectValue placeholder={selectedChannelType ? t('Select a model') : t('Select a provider first')} />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedChannelType ? (
                        <>
                          <SelectItem value='*'>{t('Global (all models)')}</SelectItem>
                          <SelectSeparator />
                          {filteredModels.map((m) => (
                            <SelectItem key={`${m.channelType}:${m.value}`} value={m.value}>
                              {m.label} <span className='text-muted-foreground ml-2 text-xs'>({m.channelName})</span>
                            </SelectItem>
                          ))}
                          {filteredModels.length === 0 && (
                            <SelectItem disabled value=''>
                              {t('No models found for this provider')}
                            </SelectItem>
                          )}
                        </>
                      ) : (
                        <SelectItem disabled value=''>
                          {t('Select a provider first')}
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {/* Preferred model hint */}
                  {selectedChannelType && preferredModel && !preferredModelLoading && (
                    <div className='absolute right-2 top-full mt-1 z-10'>
                      <Button
                        variant='ghost'
                        size='icon'
                        className='h-6 w-6 p-0 text-muted-foreground hover:text-primary'
                        onClick={() => setScopeModel(preferredModel)}
                        title={t('Use preferred model: {{model}}', { model: preferredModel })}
                      >
                        <Sparkles className='size-3.5' aria-hidden='true' />
                      </Button>
                    </div>
                  )}
                </div>
                {selectedChannelType && preferredModel && !preferredModelLoading && (
                  <p className='text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1'>
                    <Info className='size-3' aria-hidden='true' />
                    {t('Preferred model for this provider: {{model}}', { model: preferredModel })}
                    <Button
                      variant='ghost'
                      size='icon'
                      className='h-5 w-5 p-0 text-xs'
                      onClick={() => setScopeModel(preferredModel)}
                    >
                      {t('Use')}
                    </Button>
                  </p>
                )}
                {selectedChannelType && !preferredModel && !preferredModelLoading && filteredModels.length > 0 && (
                  <p className='text-xs text-amber-600 dark:text-amber-400'>
                    {t('No preferred model detected. Select one from the list.')}
                  </p>
                )}
              </div>

              <div className='grid gap-2'>
                <Label htmlFor='mm-content'>{t('Content')}</Label>
                <Textarea
                  id='mm-content'
                  rows={3}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='mm-payload'>{t('Payload (JSON)')}</Label>
                <Textarea
                  id='mm-payload'
                  rows={3}
                  className='font-mono text-xs'
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                />
              </div>
              <div className='flex items-center gap-4'>
                <div className='grid flex-1 gap-2'>
                  <Label htmlFor='mm-tags'>{t('Tags')}</Label>
                  <Input
                    id='mm-tags'
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                  />
                </div>
                <div className='flex items-center gap-2'>
                  <Switch
                    checked={autoRefresh}
                    onCheckedChange={setAutoRefresh}
                  />
                  <Label>{t('Auto refresh')}</Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleSave} disabled={upsert.isPending || !sourceQuery || !scopeModel}>
                {t('Save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className='p-0'>
        {rows.length === 0 ? (
          <EmptyState
            title={t('No mental models')}
            description={t(
              'Create a mental model manually or let the consolidation job generate them automatically.'
            )}
          />
        ) : (
          <StaticDataTable tableClassName='min-w-[760px]'>
            <TableHeader>
              <TableRow className='bg-muted/40 hover:bg-muted/40'>
                <TableHead className='h-9 w-8 px-4 text-xs'></TableHead>
                <TableHead className='h-9 px-4 text-xs'>
                  {t('Source query')}
                </TableHead>
                <TableHead className='h-9 text-xs'>{t('Scope')}</TableHead>
                <TableHead className='h-9 text-xs'>{t('Tags')}</TableHead>
                <TableHead className='h-9 text-xs'>
                  {t('Auto refresh')}
                </TableHead>
                <TableHead className='h-9 text-xs'>{t('Refreshed')}</TableHead>
                <TableHead className='h-9 w-[60px] px-4 text-xs'>
                  {t('')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <>
                  <TableRow
                    key={m.id}
                    className='hover:bg-muted/30 cursor-pointer'
                    onClick={() =>
                      setExpandedKey(
                        expandedKey === `${m.source_query}::${m.scope_model}`
                          ? null
                          : `${m.source_query}::${m.scope_model}`
                      )
                    }
                  >
                    <TableCell className='px-4 py-2.5'>
                      {expandedKey === `${m.source_query}::${m.scope_model}` ? (
                        <ChevronDown className='size-4' />
                      ) : (
                        <ChevronRight className='size-4' />
                      )}
                    </TableCell>
                    <TableCell className='px-4 py-2.5 font-mono text-xs'>
                      {m.source_query}
                    </TableCell>
                    <TableCell className='py-2.5'>
                      <Badge variant='outline' className='font-mono text-xs'>
                        {m.scope_model}
                      </Badge>
                    </TableCell>
                    <TableCell className='text-muted-foreground py-2.5 text-xs'>
                      {m.tags || '-'}
                    </TableCell>
                    <TableCell className='py-2.5'>
                      {m.auto_refresh ? (
                        <Badge variant='secondary' className='gap-1'>
                          <span className='size-1.5 rounded-full bg-emerald-500' />
                          {t('On')}
                        </Badge>
                      ) : (
                        <span className='text-muted-foreground text-xs'>
                          {t('Off')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell
                      className='text-muted-foreground py-2.5 text-xs whitespace-nowrap'
                      title={new Date(m.refreshed_at * 1000).toISOString()}
                    >
                      {formatTimestampRelative(
                        m.refreshed_at,
                        'seconds',
                        toIntlLocale(i18n.language)
                      )}
                    </TableCell>
                    <TableCell className='px-4 py-2.5'>
                      <Button
                        size='icon'
                        variant='ghost'
                        className='text-muted-foreground hover:text-destructive size-7'
                        onClick={() =>
                          handleDelete(m.source_query, m.scope_model)
                        }
                      >
                        <Trash2 className='size-3.5' aria-hidden='true' />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expandedKey === `${m.source_query}::${m.scope_model}` && (
                    <TableRow key={`detail-${m.id}`} className='bg-muted/20'>
                      <TableCell colSpan={7} className='px-4 py-3'>
                        <MentalModelDetail m={m} />
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </StaticDataTable>
        )}
      </CardContent>
    </Card>
  )
}

// --- Mental model detail (expanded row) ---

function MentalModelDetail({ m }: { m: import('../api').ProviderMentalModel }) {
  const { t } = useTranslation()

  let payload: unknown = m.payload
  try {
    payload = JSON.parse(m.payload)
  } catch {
    // keep raw
  }

  return (
    <div className='space-y-3'>
      {/* Content (markdown-like) */}
      {m.content ? (
        <div>
          <h4 className='text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase'>
            {t('Content')}
          </h4>
          <pre className='bg-muted rounded-lg p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap'>
            {m.content}
          </pre>
        </div>
      ) : (
        <p className='text-muted-foreground text-sm'>
          {t('No content yet. Will be populated by the consolidation job.')}
        </p>
      )}

      {/* Payload (structured rankings) */}
      {m.payload && m.payload !== '[]' && (
        <div>
          <h4 className='text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase'>
            {t('Payload (rankings)')}
          </h4>
          <pre className='bg-muted overflow-x-auto rounded-lg p-3 text-xs'>
            {typeof payload === 'object'
              ? JSON.stringify(payload, null, 2)
              : m.payload}
          </pre>
        </div>
      )}

      {/* Metadata */}
      <div className='flex flex-wrap gap-4 text-xs'>
        <span className='text-muted-foreground'>
          {t('Tags')}: {m.tags || '—'}
        </span>
        <span className='text-muted-foreground'>
          {t('Auto-refresh')}: {m.auto_refresh ? t('Yes') : t('No')}
        </span>
        <span className='text-muted-foreground'>
          {t('Refreshed')}: {new Date(m.refreshed_at * 1000).toLocaleString()}
        </span>
        <span className='text-muted-foreground'>
          {t('Created')}: {new Date(m.created_at * 1000).toLocaleString()}
        </span>
      </div>
    </div>
  )
}