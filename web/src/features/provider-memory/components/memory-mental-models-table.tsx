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
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, Pencil, Plus, Star, Trash2 } from 'lucide-react'

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
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ComboboxInput, type ComboboxInputOption } from '@/components/ui/combobox-input'
import { toIntlLocale } from '@/i18n/languages'
import { formatTimestampRelative } from '@/lib/format'

import {
  useBulkModelSuitability,
  useChannelsForMentalModel,
  useDeleteProviderMentalModel,
  useModelSuitability,
  useProviderMentalModels,
  useUpsertProviderMentalModel,
} from '../hooks'
import type { ModelSuitability, ProviderMentalModel } from '../api'

// Source query intents recognized by the backend consolidation job
// (see classifyQuery in service/providermemory). The canonical strings below
// are what the ranking logic expects; anything else only yields a summary.
const SOURCE_QUERIES = [
  {
    value: 'best channel by latency',
    labelKey: 'Fastest channel',
    hintKey: 'Ranks channels by lowest response latency',
  },
  {
    value: 'best channel by success',
    labelKey: 'Most reliable channel',
    hintKey: 'Ranks channels by lowest error rate',
  },
  {
    value: 'best channel by cost',
    labelKey: 'Cheapest channel',
    hintKey: 'Ranks channels by lowest cost',
  },
] as const

export function MemoryMentalModelsTable() {
  const { t } = useTranslation()
  const { data, isLoading, isError } = useProviderMentalModels()
  const { data: channelsData } = useChannelsForMentalModel()
  const upsert = useUpsertProviderMentalModel()
  const del = useDeleteProviderMentalModel()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  // Form state
  const [sourceQuery, setSourceQuery] = useState<string>(SOURCE_QUERIES[0].value)
  const [scopeModel, setScopeModel] = useState('')
  // Provider (channel type) — narrows the model list. Empty = all providers.
  const [selectedProvider, setSelectedProvider] = useState<string>('')
  const [autoRefresh, setAutoRefresh] = useState(true)
  // Fields preserved from the record being edited, so saving does not wipe them
  const [editing, setEditing] = useState<ProviderMentalModel | null>(null)

  const suitability = useModelSuitability(sourceQuery, scopeModel, dialogOpen)
const bulkSuitability = useBulkModelSuitability(sourceQuery, dialogOpen)

  const providers = useMemo(() => channelsData?.providers ?? [], [channelsData?.providers])
  const allModels = useMemo(() => channelsData?.models ?? [], [channelsData?.models])

  // Models of the selected provider (all models + model_mapping aliases)
  const scopedModels = useMemo(() => {
    if (!selectedProvider) return allModels
    return allModels.filter((m) => m.channelType.toString() === selectedProvider)
  }, [allModels, selectedProvider])

  const providerOptions = useMemo<ComboboxInputOption[]>(() => {
    return providers.map((p) => ({
      value: p.value.toString(),
      label: t(p.label),
      description: t('{{count}} enabled channels', { count: p.channelCount }),
    }))
  }, [providers, t])

  // Model suggestions depend on the selected provider, enriched with suitability data
  const modelOptions = useMemo<ComboboxInputOption[]>(() => {
    const bulkData = bulkSuitability.data ?? {}
    
    // Sort models by suitability level (high first), then by label
    const sortedModels = [...scopedModels].sort((a, b) => {
      const suitA = bulkData[a.value]
      const suitB = bulkData[b.value]
      const levelOrder = { high: 0, medium: 1, low: 2, none: 3 }
      const levelA = suitA ? levelOrder[suitA.suitability_level] : 4
      const levelB = suitB ? levelOrder[suitB.suitability_level] : 4
      if (levelA !== levelB) return levelA - levelB
      return a.label.localeCompare(b.label)
    })

    const options: ComboboxInputOption[] = [
      {
        value: '*',
        label: t('All models'),
        description: t('Applies to every model'),
      },
    ]
    for (const m of sortedModels) {
      const suit = bulkData[m.value]
      let description = m.isAlias ? t('Alias') : undefined
      let badge: ComboboxInputOption['badge'] = undefined
      let isPreferred = false
      if (suit) {
        const parts: string[] = []
        if (suit.fact_count > 0) parts.push(t('{{count}} samples', { count: suit.fact_count }))
        if (suit.observation_count > 0) parts.push(t('{{count}} observations', { count: suit.observation_count }))
        if (suit.has_mental_model) parts.push(t('Mental model exists'))
        description = parts.length > 0 ? parts.join(' · ') : undefined
        badge = {
          label: t(`suitability.${suit.suitability_level}`),
          variant:
            suit.suitability_level === 'high'
              ? 'success'
              : suit.suitability_level === 'medium'
              ? 'warning'
              : suit.suitability_level === 'low'
              ? 'destructive'
              : 'outline',
        }
        // Mark as preferred if it has high suitability and a mental model exists
        isPreferred = suit.suitability_level === 'high' && suit.has_mental_model
      }
      options.push({
        value: m.value,
        label: m.label,
        description,
        badge,
        ...(isPreferred ? { icon: <Star className='text-yellow-500' aria-hidden /> } : {}),
      })
    }
    return options
  }, [scopedModels, t, bulkSuitability.data])

  const rows = data?.data ?? []

  function handleSave() {
    upsert.mutate(
      {
        source_query: sourceQuery.trim(),
        scope_model: scopeModel.trim(),
        content: editing?.content ?? '',
        payload: editing?.payload ?? '[]',
        tags: editing?.tags ?? '',
        auto_refresh: autoRefresh === true,
      },
      {
        onSuccess: () => setDialogOpen(false),
      }
    )
  }

  function handleEdit(m: ProviderMentalModel) {
    setEditing(m)
    setSourceQuery(m.source_query)
    setScopeModel(m.scope_model === '*' ? '*' : m.scope_model)
    setSelectedProvider('')
    setAutoRefresh(m.auto_refresh === true)
    setDialogOpen(true)
  }

  function handleDelete(sq: string, sm: string) {
    del.mutate({ sourceQuery: sq, scopeModel: sm })
  }

  function resetForm() {
    setSourceQuery(SOURCE_QUERIES[0].value)
    setScopeModel('')
    setSelectedProvider('')
    setAutoRefresh(true)
    setEditing(null)
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
          <DialogContent className='sm:max-w-[520px]'>
            <DialogHeader>
              <DialogTitle>
                {editing ? t('Edit Mental Model') : t('Create Mental Model')}
              </DialogTitle>
              <DialogDescription>
                {t(
                  'Pick what to optimize for and which model it applies to. The gateway remembers the best channel for it and selects it automatically.'
                )}
              </DialogDescription>
            </DialogHeader>
            <div className='grid gap-4 py-4'>
              <div className='grid gap-2'>
                <Label>{t('What to optimize for')}</Label>
                <div className='grid gap-2'>
                  {SOURCE_QUERIES.map((sq) => (
                    <button
                      key={sq.value}
                      type='button'
                      onClick={() => setSourceQuery(sq.value)}
                      className={
                        sourceQuery === sq.value
                          ? 'border-primary bg-primary/5 flex items-start gap-3 rounded-lg border p-3 text-left'
                          : 'hover:border-muted-foreground/40 flex items-start gap-3 rounded-lg border p-3 text-left transition-colors'
                      }
                    >
                      <span
                        aria-hidden='true'
                        className={
                          sourceQuery === sq.value
                            ? 'border-primary mt-0.5 size-4 shrink-0 rounded-full border-4'
                            : 'border-muted-foreground/40 mt-0.5 size-4 shrink-0 rounded-full border-2'
                        }
                      />
                      <span className='grid gap-0.5'>
                        <span className='text-sm font-medium'>{t(sq.labelKey)}</span>
                        <span className='text-muted-foreground text-xs'>
                          {t(sq.hintKey)}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Provider autocomplete — narrows the model list below */}
              <div className='grid gap-2'>
                <Label htmlFor='mm-provider'>{t('Provider')}</Label>
                <ComboboxInput
                  id='mm-provider'
                  options={providerOptions}
                  value={selectedProvider}
                  onValueChange={(v) => {
                    setSelectedProvider(v)
                    setScopeModel('')
                  }}
                  placeholder={t('All providers')}
                  emptyText={t('No matching providers')}
                  allowCustomValue
                />
              </div>

              {/* Model autocomplete — options depend on the selected provider */}
              <div className='grid gap-2'>
                <Label htmlFor='mm-scope'>{t('Applies to model')}</Label>
                <ComboboxInput
                  id='mm-scope'
                  options={modelOptions}
                  value={scopeModel}
                  onValueChange={setScopeModel}
                  placeholder={t('Any model name, alias, or *')}
                  emptyText={t('No matching models')}
                  allowCustomValue
                />
                <p className='text-muted-foreground text-xs'>
                  {selectedProvider
                    ? t(
                        '{{count}} models and aliases available for the selected provider.',
                        { count: scopedModels.length }
                      )
                    : t(
                        'Pick a provider to narrow the list, or search across all models and aliases.'
                      )}
                </p>
              </div>

              {/* Suitability / preference hint */}
              {suitability.data && (
                <div
                  className={
                    `rounded-lg p-3 border text-sm transition-colors `
                    + (
                      suitability.data.suitability_level === 'high'
                        ? 'border-emerald-500/30 bg-emerald-500/5'
                        : suitability.data.suitability_level === 'medium'
                        ? 'border-amber-500/30 bg-amber-500/5'
                        : suitability.data.suitability_level === 'low'
                        ? 'border-orange-500/30 bg-orange-500/5'
                        : 'border-muted-foreground/20 bg-muted/30'
                    )
                  }
                >
                  <div className='flex items-start gap-2'>
                    <span className='shrink-0 mt-0.5 text-lg'>
                      {suitability.data.suitability_level === 'high' && '✅'}
                      {suitability.data.suitability_level === 'medium' && '⚠️'}
                      {suitability.data.suitability_level === 'low' && '🔶'}
                      {suitability.data.suitability_level === 'none' && '❌'}
                    </span>
                    <div className='flex-1 min-w-0'>
                      <div className='font-medium'>{t('Suitability')}:{' '}
                        <span
                          className={
                            suitability.data.suitability_level === 'high'
                              ? 'text-emerald-600'
                              : suitability.data.suitability_level === 'medium'
                              ? 'text-amber-600'
                              : suitability.data.suitability_level === 'low'
                              ? 'text-orange-600'
                              : 'text-muted-foreground'
                          }
                        >
                          {t(
                            `suitability.${suitability.data.suitability_level}`
                          )}
                        </span>
                      </div>
                      <div className='text-muted-foreground text-xs mt-1'>
                        {suitability.data.explanation}
                      </div>
                      {suitability.data.best_channel &&
                        suitability.data.best_channel.Rankings.length > 0 && (
                          <div className='mt-2 text-xs text-muted-foreground'>
                            {t('Current best channel')}:{' '}
                            {suitability.data.best_channel.Rankings.map((r, i) =>
                              i < 3
                                ? (
                                    <span
                                      key={r.ChannelId}
                                      className='font-mono mr-1'
                                    >
                                      #{r.ChannelId} {r.ModelName} ({r.Score.toFixed(4)})
                                    </span>
                                  )
                                : null
                            )}
                            {suitability.data.best_channel.Rankings.length > 3 && (
                              <span>…</span>
                            )}
                          </div>
                        )}
                      {suitability.data.has_mental_model && (
                        <div className='mt-2 text-xs text-emerald-600'>
                          ✅ {t('Mental model already exists and is used for routing')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {suitability.isLoading && (
                <div className='rounded-lg p-3 border border-muted-foreground/20 bg-muted/30 text-sm text-muted-foreground'>
                  {t('Checking suitability…')}
                </div>
              )}

              <div className='flex items-center gap-2'>
                <Switch
                  id='mm-autorefresh'
                  checked={autoRefresh}
                  onCheckedChange={(value) => setAutoRefresh(value === true)}
                />
                <Label htmlFor='mm-autorefresh'>{t('Keep this answer up to date automatically')}</Label>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleSave}
                disabled={upsert.isPending || !sourceQuery || !scopeModel}
              >
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
              'Nothing here yet. Add one to let the gateway remember the best channel for a model, or wait for it to be generated from traffic automatically.'
            )}
          />
        ) : (
          <StaticDataTable tableClassName='min-w-[760px]'>
            <TableHeader>
              <TableRow className='bg-muted/40 hover:bg-muted/40'>
                <TableHead className='h-9 w-8 px-4 text-xs' />
                <TableHead className='h-9 px-4 text-xs'>
                  {t('Optimize for')}
                </TableHead>
                <TableHead className='h-9 text-xs'>{t('Applies to model')}</TableHead>
                <TableHead className='h-9 text-xs'>{t('Auto refresh')}</TableHead>
                <TableHead className='h-9 text-xs'>{t('Refreshed')}</TableHead>
                <TableHead className='h-9 w-[60px] px-4 text-xs'>
                  {t('')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <MentalModelRow
                  key={m.id}
                  m={m}
                  expanded={expandedKey === `${m.source_query}::${m.scope_model}`}
                  onToggle={() =>
                    setExpandedKey(
                      expandedKey === `${m.source_query}::${m.scope_model}`
                        ? null
                        : `${m.source_query}::${m.scope_model}`
                    )
                  }
                  onDelete={() => handleDelete(m.source_query, m.scope_model)}
                  onEdit={() => handleEdit(m)}
                />
              ))}
            </TableBody>
          </StaticDataTable>
        )}
      </CardContent>
    </Card>
  )
}

function MentalModelRow({
  m,
  expanded,
  onToggle,
  onDelete,
  onEdit,
}: {
  m: ProviderMentalModel
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
  onEdit: () => void
}) {
  const { t, i18n } = useTranslation()
  return (
    <>
      <TableRow className='hover:bg-muted/30 cursor-pointer' onClick={onToggle}>
        <TableCell className='px-4 py-2.5'>
          {expanded ? (
            <ChevronDown className='size-4' />
          ) : (
            <ChevronRight className='size-4' />
          )}
        </TableCell>
        <TableCell className='px-4 py-2.5 text-xs'>
          {sourceQueryLabel(m.source_query, t)}
        </TableCell>
        <TableCell className='py-2.5'>
          <Badge variant='outline' className='font-mono text-xs'>
            {m.scope_model === '*' ? t('All models') : m.scope_model}
          </Badge>
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
          <div className='flex items-center gap-1'>
            <Button
              size='icon'
              variant='ghost'
              className='text-muted-foreground hover:text-primary size-7'
              onClick={(e) => {
                e.stopPropagation()
                onEdit()
              }}
              aria-label={t('Edit')}
            >
              <Pencil className='size-3.5' aria-hidden='true' />
            </Button>
            <Button
              size='icon'
              variant='ghost'
              className='text-muted-foreground hover:text-destructive size-7'
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              aria-label={t('Delete')}
            >
              <Trash2 className='size-3.5' aria-hidden='true' />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className='bg-muted/20'>
          <TableCell colSpan={6} className='px-4 py-3'>
            <MentalModelDetail m={m} />
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

function sourceQueryLabel(
  sourceQuery: string,
  t: (key: string) => string
): string {
  const preset = SOURCE_QUERIES.find((sq) => sq.value === sourceQuery)
  return preset ? t(preset.labelKey) : sourceQuery
}

function MentalModelDetail({ m }: { m: ProviderMentalModel }) {
  const { t } = useTranslation()

  let payload: unknown = m.payload
  try {
    payload = JSON.parse(m.payload)
  } catch {
    // keep raw
  }

  return (
    <div className='space-y-3'>
      {m.content ? (
        <div>
          <h4 className='text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase'>
            {t('Result')}
          </h4>
          <pre className='bg-muted rounded-lg p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap'>
            {m.content}
          </pre>
        </div>
      ) : (
        <p className='text-muted-foreground text-sm'>
          {t(
            'Not computed yet. The gateway fills this in after collecting enough traffic for the selected model.'
          )}
        </p>
      )}

      {m.payload && m.payload !== '[]' && (
        <div>
          <h4 className='text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase'>
            {t('Rankings')}
          </h4>
          <pre className='bg-muted overflow-x-auto rounded-lg p-3 text-xs'>
            {typeof payload === 'object'
              ? JSON.stringify(payload, null, 2)
              : m.payload}
          </pre>
        </div>
      )}

      <div className='flex flex-wrap gap-4 text-xs'>
        <span className='text-muted-foreground'>
          {t('Auto-refresh')}: {m.auto_refresh ? t('Yes') : t('No')}
        </span>
        <span className='text-muted-foreground'>
          {t('Last updated')}: {new Date(m.refreshed_at * 1000).toLocaleString()}
        </span>
        <span className='text-muted-foreground'>
          {t('Created')}: {new Date(m.created_at * 1000).toLocaleString()}
        </span>
      </div>
    </div>
  )
}
