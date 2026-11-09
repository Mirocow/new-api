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
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Plus, Edit, Trash2, Loader2, FileText, ChevronRight, ChevronDown } from 'lucide-react'

import {
  listKnowledgePages,
  createKnowledgePage,
  updateKnowledgePage,
  deleteKnowledgePage,
  type KnowledgePage,
} from '../api'

interface KnowledgePagesTabProps {
  bankId: number
}

export function KnowledgePagesTab({ bankId }: KnowledgePagesTabProps) {
  const { t } = useTranslation()
  const [pages, setPages] = useState<KnowledgePage[]>([])
  const [loading, setLoading] = useState(false)
  const [pathPrefix, setPathPrefix] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingPage, setEditingPage] = useState<KnowledgePage | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newPath, setNewPath] = useState('')
  const [newParentId, setNewParentId] = useState('')

  const loadPages = async () => {
    setLoading(true)
    try {
      const data = await listKnowledgePages(bankId, pathPrefix || undefined)
      setPages(data)
    } catch {
      // Error handled by api layer
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPages()
  }, [bankId, pathPrefix])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim() || !newPath.trim()) return
    try {
      await createKnowledgePage({
        bank_id: bankId,
        title: newTitle,
        content: newContent,
        path: newPath,
        parent_id: newParentId ? parseInt(newParentId, 10) : undefined,
      })
      setShowCreateDialog(false)
      setNewTitle('')
      setNewContent('')
      setNewPath('')
      setNewParentId('')
      loadPages()
    } catch {
      // Error handled by api layer
    }
  }

  const handleUpdate = async () => {
    if (!editingPage || !newTitle.trim()) return
    try {
      await updateKnowledgePage(editingPage.id, {
        title: newTitle,
        content: newContent,
        path: newPath,
      })
      setEditingPage(null)
      setNewTitle('')
      setNewContent('')
      setNewPath('')
      loadPages()
    } catch {
      // Error handled by api layer
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm(t('Are you sure you want to delete this knowledge page?'))) return
    try {
      await deleteKnowledgePage(id)
      loadPages()
    } catch {
      // Error handled by api layer
    }
  }

  const startEdit = (page: KnowledgePage) => {
    setEditingPage(page)
    setNewTitle(page.title)
    setNewContent(page.content)
    setNewPath(page.path)
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString()
  }

  // Build tree structure from flat list
  const buildTree = (pages: KnowledgePage[], parentId: number | null = null): KnowledgePage[] => {
    return pages
      .filter((p) => p.parent_id === parentId)
      .map((p) => ({ ...p, children: buildTree(pages, p.id) }))
  }

  const tree = buildTree(pages)

  const renderTree = (nodes: KnowledgePage[], depth = 0) => (
    <div className='space-y-1'>
      {nodes.map((node) => (
        <div key={node.id} className='flex items-center gap-2'>
          <div className='flex items-center gap-2' style={{ paddingLeft: `${depth * 16}px` }}>
            <FileText className='size-4 text-muted-foreground' aria-hidden='true' />
            <span className='font-medium truncate max-w-[300px]'>{node.title}</span>
            <Badge variant='outline' className='text-xs'>{node.path}</Badge>
            <div className='flex items-center gap-1 ml-auto'>
              <Button variant='ghost' size='sm' onClick={() => startEdit(node)}>
                <Edit className='size-3' aria-hidden='true' />
              </Button>
              <Button variant='ghost' size='sm' onClick={() => handleDelete(node.id)} className='text-destructive hover:text-destructive'>
                <Trash2 className='size-3' aria-hidden='true' />
              </Button>
            </div>
          </div>
          {node.children && node.children.length > 0 && (
            <div className='ml-4 border-l border-muted pl-2'>
              {renderTree(node.children, depth + 1)}
            </div>
          )}
        </div>
      ))}
    </div>
  )

  return (
    <div className='space-y-4'>
      {/* Header with path filter */}
      <Card>
        <CardHeader>
          <div className='flex items-center justify-between'>
            <CardTitle className='flex items-center gap-2'>
              <FileText className='size-4' aria-hidden='true' />
              {t('Knowledge Pages')}
            </CardTitle>
            <div className='flex items-center gap-2'>
              <Input
                placeholder={t('Path prefix filter (optional)')}
                value={pathPrefix}
                onChange={(e) => setPathPrefix(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadPages()}
                className='w-64'
              />
              <Button variant='outline' size='sm' onClick={loadPages} disabled={loading}>
                <Loader2 className={loading ? 'animate-spin' : ''} size={16} aria-hidden='true' />
                {t('Filter')}
              </Button>
              <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className='mr-2 size-4' aria-hidden='true' />
                    {t('Create Page')}
                  </Button>
                </DialogTrigger>
                <DialogContent className='max-w-2xl'>
                  <DialogHeader>
                    <DialogTitle>{t('Create Knowledge Page')}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreate} className='space-y-4'>
                    <div className='space-y-2'>
                      <label className='text-sm font-medium'>{t('Title')}</label>
                      <Input
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder={t('Page title')}
                      />
                    </div>
                    <div className='space-y-2'>
                      <label className='text-sm font-medium'>{t('Path')}</label>
                      <Input
                        value={newPath}
                        onChange={(e) => setNewPath(e.target.value)}
                        placeholder={t('e.g., /guides/getting-started')}
                      />
                    </div>
                    <div className='space-y-2'>
                      <label className='text-sm font-medium'>{t('Parent Page ID (optional)')}</label>
                      <Input
                        type='number'
                        value={newParentId}
                        onChange={(e) => setNewParentId(e.target.value)}
                        placeholder={t('Leave empty for root level')}
                      />
                    </div>
                    <div className='space-y-2'>
                      <label className='text-sm font-medium'>{t('Content')}</label>
                      <Textarea
                        value={newContent}
                        onChange={(e) => setNewContent(e.target.value)}
                        placeholder={t('Page content (markdown supported)')}
                        rows={10}
                      />
                    </div>
                    <DialogFooter>
                      <Button type='button' variant='outline' onClick={() => setShowCreateDialog(false)}>
                        {t('Cancel')}
                      </Button>
                      <Button type='submit' disabled={!newTitle.trim() || !newPath.trim()}>
                        {t('Create')}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className='flex items-center justify-center py-8'>
              <Loader2 className='animate-spin size-6' aria-hidden='true' />
              <span className='ml-2 text-muted-foreground'>{t('Loading...')}</span>
            </div>
          ) : pages.length === 0 ? (
            <p className='text-sm text-muted-foreground text-center py-8'>
              {t('No knowledge pages yet. Create one to get started.')}
            </p>
          ) : (
            <ScrollArea className='h-[500px]'>
              <div className='space-y-1 p-2'>{renderTree(tree)}</div>
            </ScrollArea>
          )}

          {/* Edit Dialog */}
          {editingPage && (
            <Dialog open={true} onOpenChange={() => setEditingPage(null)}>
              <DialogContent className='max-w-2xl'>
                <DialogHeader>
                  <DialogTitle>{t('Edit Knowledge Page')}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleUpdate} className='space-y-4'>
                  <div className='space-y-2'>
                    <label className='text-sm font-medium'>{t('Title')}</label>
                    <Input
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                    />
                  </div>
                  <div className='space-y-2'>
                    <label className='text-sm font-medium'>{t('Path')}</label>
                    <Input
                      value={newPath}
                      onChange={(e) => setNewPath(e.target.value)}
                    />
                  </div>
                  <div className='space-y-2'>
                    <label className='text-sm font-medium'>{t('Content')}</label>
                    <Textarea
                      value={newContent}
                      onChange={(e) => setNewContent(e.target.value)}
                      rows={10}
                    />
                  </div>
                  <DialogFooter>
                    <Button type='button' variant='outline' onClick={() => setEditingPage(null)}>
                      {t('Cancel')}
                    </Button>
                    <Button type='submit' disabled={!newTitle.trim()}>
                      {t('Save')}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </CardContent>
      </Card>
    </div>
  )
}