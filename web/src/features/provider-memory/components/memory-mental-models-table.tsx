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
import { ChevronDown, ChevronRight, Info, Plus, Trash2 } from 'lucide-react'

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
import { Textarea } from '@/components/ui/textarea'
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
// (see classifyQuery in service/providermemory): queries containing these
// keywords produce ranked answers; anything else produces a plain summary.
const SOURCE_QUERY_PRESETS = [
  'best channel by latency',
  'best channel by success',
  'best channel by cost',
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
  const [sourceQuery, setSourceQuery] = useState('')
  const [scopeModel, setScopeModel] = useState('')
  // Optional filter; it only reorders/limits suggestions, never blocks custom input
  const [providerFilter, setProviderFilter] = useState<string>('')
  const [content, setContent] = useState('')
  const [payload, setPayload] = useState('[]')
  const [tags, setTags] = useState('')
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
    setProviderFilter('')
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
                <p className='text-muted-foreground flex items-start gap-1 text-xs'>
                  <Info className='mt-0.5 size-3 shrink-0' aria-hidden='true' />
                  {t(
                    'The question this model answers. Queries mentioning latency/fast, success/reliability or cost/cheap produce ranked answers; any other text produces a plain summary.'
                  )}
                </p>
                <div className='flex flex-wrap gap-1.5'>
                  {SOURCE_QUERY_PRESETS.map((preset) => (
                    <Button
                      key={preset}
                      type='button'
                      variant={sourceQuery === preset ? 'secondary' : 'outline'}
                      size='sm'
                      className='h-6 px-2 text-xs'
                      onClick={() => setSourceQuery(preset)}
                    >
                      {preset}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Model scope: free input with suggestions — never blocks custom values */}
              <div className='grid gap-2'>
                <Label htmlFor='mm-scope'>{t('Model (Scope)')}</Label>
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
                    'Pick a suggestion or type any model name / alias. Use * for all models.'
                  )}
                </p>
              </div>

              {/* Optional provider filter for narrowing suggestions */}
              <div className='grid gap-2'>
                <Label htmlFor='mm-provider'>{t('Filter suggestions by provider (optional)')}</Label>
                <Select value={providerFilter} onValueChange={(v) => setProviderFilter(v === 'all' ? '' : v)}>
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
                {providerFilter && (
                  <p className='text-muted-foreground text-xs'>
                    {t('Showing suggestions from the selected provider; other models can still be typed manually.')}
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
                <TableHead className='h-9 w-8 px-4 text-xs' />
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
            onClick={onDelete}
          >
            <Trash2 className='size-3.5' aria-hidden='true' />
          </Button>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className='bg-muted/20'>
          <TableCell colSpan={7} className='px-4 py-3'>
            <MentalModelDetail m={m} />
          </TableCell>
        </TableRow>
      )}
    </>
  )
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
