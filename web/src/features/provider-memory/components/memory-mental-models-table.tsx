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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'

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
import { Textarea } from '@/components/ui/textarea'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toIntlLocale } from '@/i18n/languages'
import { formatTimestampRelative } from '@/lib/format'

import {
  useDeleteProviderMentalModel,
  useProviderMentalModels,
  useUpsertProviderMentalModel,
} from '../hooks'

export function MemoryMentalModelsTable() {
  const { t, i18n } = useTranslation()
  const { data, isLoading, isError } = useProviderMentalModels()
  const upsert = useUpsertProviderMentalModel()
  const del = useDeleteProviderMentalModel()
  const [dialogOpen, setDialogOpen] = useState(false)

  // Form state
  const [sourceQuery, setSourceQuery] = useState('')
  const [scopeModel, setScopeModel] = useState('')
  const [content, setContent] = useState('')
  const [payload, setPayload] = useState('[]')
  const [tags, setTags] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)

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

  if (isLoading) {
    return (
      <Card>
        <CardContent className='space-y-3 py-4'>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className='h-9 w-full rounded bg-muted animate-pulse' />
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
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
              <div className='grid gap-2'>
                <Label htmlFor='mm-scope'>{t('Scope model')}</Label>
                <Input
                  id='mm-scope'
                  placeholder='gpt-4o or *'
                  value={scopeModel}
                  onChange={(e) => setScopeModel(e.target.value)}
                />
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
              <Button onClick={handleSave} disabled={upsert.isPending}>
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
                <TableHead className='h-9 px-4 text-xs'>
                  {t('Source query')}
                </TableHead>
                <TableHead className='h-9 text-xs'>{t('Scope')}</TableHead>
                <TableHead className='h-9 text-xs'>{t('Tags')}</TableHead>
                <TableHead className='h-9 text-xs'>
                  {t('Auto refresh')}
                </TableHead>
                <TableHead className='h-9 text-xs'>
                  {t('Refreshed')}
                </TableHead>
                <TableHead className='h-9 w-[60px] px-4 text-xs'>
                  {t('')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.id} className='hover:bg-muted/30'>
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
                      onClick={() => handleDelete(m.source_query, m.scope_model)}
                    >
                      <Trash2 className='size-3.5' aria-hidden='true' />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </StaticDataTable>
        )}
      </CardContent>
    </Card>
  )
}