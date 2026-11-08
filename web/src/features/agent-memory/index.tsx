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

import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Plus } from 'lucide-react'

import {
  listMemoryBanks,
  createMemoryBank,
  type MemoryBank,
} from './api'

export function AgentMemory() {
  const { t } = useTranslation()
  const [banks, setBanks] = useState<MemoryBank[]>([])
  const [loading, setLoading] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAgentId, setNewAgentId] = useState('')
  const [newDescription, setNewDescription] = useState('')

  const loadBanks = async () => {
    setLoading(true)
    try {
      // In a real deployment, userId comes from the auth store.
      // Here we use a placeholder; the backend filters by the authenticated user.
      const data = await listMemoryBanks(0)
      setBanks(data)
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
    } catch {
      // Error handled by api layer (toast)
    }
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        <span className='inline-flex min-w-0 items-center gap-2'>
          <span className='size-5' aria-hidden='true' />
          <span className='truncate'>{t('Agent Memory')}</span>
        </span>
      </SectionPageLayout.Content>
      <div className='space-y-6'>
        <Card>
          <CardHeader>
            <CardTitle>{t('Memory Banks')}</CardTitle>
            <CardDescription>
              {t(
                'Isolated memory stores for AI agents. Each bank retains facts, observations, mental models and knowledge pages.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <form onSubmit={handleCreate} className='space-y-4'>
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
                        <div>
                          <div className='font-medium'>{bank.name}</div>
                          <div className='text-xs text-muted-foreground'>
                            {bank.agent_id || t('global agent')}
                            {bank.description ? ` · ${bank.description}` : ''}
                          </div>
                        </div>
                        <div className='text-xs text-muted-foreground'>
                          {t('ID')}:
                          {bank.id}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('Quick Actions')}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
              <Button variant='outline' onClick={() => {}} disabled={true}>
                {t('Retain (coming soon)')}
              </Button>
              <Button variant='outline' onClick={() => {}} disabled={true}>
                {t('Recall (coming soon)')}
              </Button>
              <Button variant='outline' onClick={() => {}} disabled={true}>
                {t('Reflect (coming soon)')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </SectionPageLayout>
  )
}
