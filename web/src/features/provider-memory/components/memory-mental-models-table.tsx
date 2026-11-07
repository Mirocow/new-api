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
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  useChannelsForMentalModel,
  useDeleteProviderMentalModel,
  useProviderMentalModels,
  useUpsertProviderMentalModel,
} from '../hooks'
import type { ProviderMentalModel } from '../api'

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
  // Optional filter; it only narrows suggestions, never blocks custom input
  const [providerFilter, setProviderFilter] = useState<string>('')
  const [autoRefresh, setAutoRefresh] = useState(true)

  const modelOptions = useMemo<ComboboxInputOption[]>(() => {
    const gatewayModels = channelsData?.gatewayModels ?? []
    const channelModels = channelsData?.models ?? []
    const provider = providerFilter
      ? channelModels.filter((cm) => cm.channelType.toString() === providerFilter)
      : channelModels
    const seen = new Set<string>()
    const options: ComboboxInputOption[] = [
      { value: '*', label: t('Global (all models)'), description: t('Applies to every model') },
    ]
    for (const cm of provider) {
      if (seen.has(cm.value)) continue
      seen.add(cm.value)
      options.push({ value: cm.value, label: cm.value, description: cm.channelName })
    }
    // When no provider filter is active, also suggest gateway-only models (aliases)
    if (!providerFilter) {
      for (const m of gatewayModels) {
        if (seen.has(m)) continue
        seen.add(m)
        options.push({ value: m, label: m, description: t('Alias / gateway model') })
      }
    }
    return options
  }, [channelsData, providerFilter, t])

  const providerOptions = useMemo(() => {
    const types = channelsData?.channelTypes ?? []
    return types.map((ct) => ({ value: ct.value.toString(), label: ct.label }))
  }, [channelsData])

  const rows = data?.data ?? []

  function handleSave() {
    upsert.mutate(
      {
        source_query: sourceQuery,
        scope_model: scopeModel,
        content: '',
        payload: '[]',
        tags: '',
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
    setSourceQuery(SOURCE_QUERIES[0].value)
    setScopeModel('')
    setProviderFilter('')
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
          <DialogContent className='sm:max-w-[520px]'>
            <DialogHeader>
              <DialogTitle>{t('Create / Update Mental Model')}</DialogTitle>
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

              {/* Model scope: free input with suggestions — never blocks custom values */}
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
                  {t(
                    'Type any model name or alias, or pick * to apply to all models.'
                  )}
                </p>
              </div>

              {/* Optional provider filter for narrowing suggestions */}
              {providerOptions.length > 0 && (
                <div className='grid gap-2'>
                  <Label htmlFor='mm-provider'>
                    {t('Narrow suggestions by provider')}
                  </Label>
                  <Select
                    value={providerFilter || 'all'}
                    onValueChange={(v) => setProviderFilter(v === 'all' ? '' : v)}
                  >
                    <SelectTrigger id='mm-provider'>
                      <SelectValue placeholder={t('All providers')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>{t('All providers')}</SelectItem>
                      {providerOptions.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className='flex items-center gap-2'>
                <Switch
                  id='mm-autorefresh'
                  checked={autoRefresh}
                  onCheckedChange={setAutoRefresh}
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
}: {
  m: ProviderMentalModel
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
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
          <Button
            size='icon'
            variant='ghost'
            className='text-muted-foreground hover:text-destructive size-7'
            onClick={onDelete}
          >
            <Trash2 className='size-3.5' aria-hidden='true' />
          </Button>
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
