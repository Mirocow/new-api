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

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, Edit, Search, Brain, FileText, Sparkles, Database, RefreshCw } from 'lucide-react'

import {
  listMemoryBanks,
  createMemoryBank,
  updateMemoryBank,
  deleteMemoryBank,
  getMemoryBank,
  type MemoryBank,
} from '../api'

import { MemoryFactsTab } from './MemoryFactsTab'
import { MemoryObservationsTab } from './MemoryObservationsTab'
import { MemoryMentalModelsTab } from './MemoryMentalModelsTab'
import { KnowledgePagesTab } from './KnowledgePagesTab'
import { RetainRecallReflectTab } from './RetainRecallReflectTab'

interface MemoryBankTabsProps {
  selectedBankId?: number
  onBankSelect?: (bankId: number) => void
}

export function MemoryBankTabs({ selectedBankId, onBankSelect }: MemoryBankTabsProps) {
  const { t } = useTranslation()
  const [banks, setBanks] = useState<MemoryBank[]>([])
  const [loading, setLoading] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAgentId, setNewAgentId] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [editingBank, setEditingBank] = useState<MemoryBank | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')

  const loadBanks = async () => {
    setLoading(true)
    try {
      const data = await listMemoryBanks(0)
      setBanks(data)
      if (data.length > 0 && !selectedBankId && onBankSelect) {
        onBankSelect(data[0].id)
      }
    } catch {
      // Ignore — banks may be empty if agent memory is not configured.
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    try {
      const bank = await createMemoryBank({
        user_id: 0,
        agent_id: newAgentId || undefined,
        name: newName,
        description: newDescription || undefined,
      })
      setBanks((prev) => [bank, ...prev])
      setNewName('')
      setNewAgentId('')
      setNewDescription('')
      if (onBankSelect) {
        onBankSelect(bank.id)
      }
    } catch {
      // Error handled by api layer (toast)
    }
  }

  const handleEditStart = (bank: MemoryBank) => {
    setEditingBank(bank)
    setEditName(bank.name)
    setEditDescription(bank.description || '')
  }

  const handleEditSave = async () => {
    if (!editingBank || !editName.trim()) return
    try {
      await updateMemoryBank(editingBank.id, {
        name: editName,
        description: editDescription || undefined,
      })
      setBanks((prev) =>
        prev.map((b) => (b.id === editingBank.id ? { ...b, name: editName, description: editDescription } : b))
      )
      setEditingBank(null)
    } catch {
      // Error handled by api layer
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm(t('Are you sure you want to delete this memory bank?'))) return
    try {
      await deleteMemoryBank(id)
      setBanks((prev) => prev.filter((b) => b.id !== id))
      if (selectedBankId === id && onBankSelect) {
        const remaining = banks.filter((b) => b.id !== id)
        onBankSelect(remaining.length > 0 ? remaining[0].id : 0)
      }
    } catch {
      // Error handled by api layer
    }
  }

  return (
    <div className='space-y-6'>
      {/* Memory Banks List */}
      <Card>
        <CardHeader>
          <div className='flex items-center justify-between'>
            <div>
              <CardTitle>{t('Memory Banks')}</CardTitle>
              <CardDescription>
                {t('Isolated memory stores for AI agents. Each bank retains facts, observations, mental models and knowledge pages.')}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          <form onSubmit={handleCreate} className='space-y-4 p-4 border rounded-lg bg-muted/30'>
            <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
              <Input
                placeholder={t('Bank name')}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={loading}
              />
              <Input
                placeholder={t('Agent ID (optional)')}
                value={newAgentId}
                onChange={(e) => setNewAgentId(e.target.value)}
                disabled={loading}
              />
              <Input
                placeholder={t('Description (optional)')}
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                disabled={loading}
              />
            </div>
            <Button type='submit' disabled={loading || !newName.trim()}>
              <Plus className='mr-2 size-4' aria-hidden='true' />
              {t('Create Bank')}
            </Button>
          </form>

          <div className='space-y-2'>
            {banks.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('No memory banks yet. Create one to get started.')}
              </p>
            ) : (
              <div className='space-y-2'>
                {banks.map((bank) => (
                  <Card key={bank.id} className='border-none bg-transparent p-2'>
                    <CardContent className='p-3 flex items-center justify-between gap-4'>
                      {editingBank?.id === bank.id ? (
                        <div className='flex-1 space-y-2'>
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className='max-w-xs'
                          />
                          <Input
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            placeholder={t('Description (optional)')}
                            className='max-w-xs'
                          />
                          <div className='flex gap-2'>
                            <Button size='sm' onClick={handleEditSave}>
                              <Check className='mr-1 size-3' aria-hidden='true' />
                              {t('Save')}
                            </Button>
                            <Button size='sm' variant='ghost' onClick={() => setEditingBank(null)}>
                              <X className='mr-1 size-3' aria-hidden='true' />
                              {t('Cancel')}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className='flex-1 flex items-center gap-4 min-w-0'>
                            <div className='min-w-0'>
                              <div className='font-medium truncate'>{bank.name}</div>
                              <div className='text-xs text-muted-foreground truncate'>
                                {bank.agent_id || t('global agent')}
                                {bank.description ? ` · ${bank.description}` : ''}
                              </div>
                            </div>
                            <div className='text-xs text-muted-foreground whitespace-nowrap'>
                              {t('ID')}: {bank.id}
                            </div>
                          </div>
                          <div className='flex items-center gap-2'>
                            <Button
                              variant='ghost'
                              size='sm'
                              onClick={() => onBankSelect?.(bank.id)}
                              className={selectedBankId === bank.id ? 'bg-primary text-primary-foreground' : ''}
                            >
                              {t('Select')}
                            </Button>
                            <Button variant='ghost' size='sm' onClick={() => handleEditStart(bank)}>
                              <Edit className='size-4' aria-hidden='true' />
                            </Button>
                            <Button variant='ghost' size='sm' onClick={() => handleDelete(bank.id)} className='text-destructive hover:text-destructive'>
                              <Trash2 className='size-4' aria-hidden='true' />
                            </Button>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs for selected bank */}
      {selectedBankId && (
        <Tabs defaultValue='facts' className='space-y-4'>
          <TabsList className='grid w-full grid-cols-5'>
            <TabsTrigger value='facts'>
              <Database className='mr-2 size-4' aria-hidden='true' />
              {t('Facts')}
            </TabsTrigger>
            <TabsTrigger value='observations'>
              <Sparkles className='mr-2 size-4' aria-hidden='true' />
              {t('Observations')}
            </TabsTrigger>
            <TabsTrigger value='mental-models'>
              <Brain className='mr-2 size-4' aria-hidden='true' />
              {t('Mental Models')}
            </TabsTrigger>
            <TabsTrigger value='knowledge-pages'>
              <FileText className='mr-2 size-4' aria-hidden='true' />
              {t('Knowledge Pages')}
            </TabsTrigger>
            <TabsTrigger value='tools'>
              <Search className='mr-2 size-4' aria-hidden='true' />
              {t('Tools')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value='facts'>
            <MemoryFactsTab bankId={selectedBankId} />
          </TabsContent>
          <TabsContent value='observations'>
            <MemoryObservationsTab bankId={selectedBankId} />
          </TabsContent>
          <TabsContent value='mental-models'>
            <MemoryMentalModelsTab bankId={selectedBankId} />
          </TabsContent>
          <TabsContent value='knowledge-pages'>
            <KnowledgePagesTab bankId={selectedBankId} />
          </TabsContent>
          <TabsContent value='tools'>
            <RetainRecallReflectTab bankId={selectedBankId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

// Need to import Check and X icons
import { Check, X } from 'lucide-react'