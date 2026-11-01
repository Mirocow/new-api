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
import { FileText, Folder, FolderOpen, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import type { ProviderMentalModel } from '../api'
import { useProviderMentalModels } from '../hooks'

// --- Tree building ---

interface TreeNode {
  name: string
  path: string
  children: Map<string, TreeNode>
  models: ProviderMentalModel[]
}

function buildTree(models: ProviderMentalModel[]): TreeNode {
  const root: TreeNode = {
    name: '',
    path: '',
    children: new Map(),
    models: [],
  }

  for (const m of models) {
    // Use tags as folder path (comma-separated), fallback to scope_model
    const folderPath = m.tags || m.scope_model || 'Uncategorized'
    const parts = folderPath
      .split('/')
      .map((p) => p.trim())
      .filter(Boolean)

    let node = root
    let currentPath = ''
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part
      let child = node.children.get(part)
      if (!child) {
        child = {
          name: part,
          path: currentPath,
          children: new Map(),
          models: [],
        }
        node.children.set(part, child)
      }
      node = child
    }
    node.models.push(m)
  }

  return root
}

function countDescendants(node: TreeNode): number {
  let count = node.models.length
  for (const child of node.children.values()) {
    count += countDescendants(child)
  }
  return count
}

// --- Tree item ---

function TreeFolder({
  node,
  depth,
  selectedPath,
  onSelect,
  expandedSet,
  toggleExpand,
}: {
  node: TreeNode
  depth: number
  selectedPath: string
  onSelect: (path: string, model: ProviderMentalModel) => void
  expandedSet: Set<string>
  toggleExpand: (path: string) => void
}) {
  const isExpanded = expandedSet.has(node.path) || depth === 0
  const childCount = countDescendants(node)

  return (
    <div>
      {depth > 0 && (
        <button
          type='button'
          onClick={() => toggleExpand(node.path)}
          className='hover:bg-muted flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm'
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {isExpanded ? (
            <FolderOpen className='size-4 shrink-0 text-amber-500' />
          ) : (
            <Folder className='size-4 shrink-0 text-amber-500' />
          )}
          <span className='truncate font-medium'>{node.name}</span>
          <Badge variant='secondary' className='ml-auto shrink-0 text-xs'>
            {childCount}
          </Badge>
        </button>
      )}

      {isExpanded && (
        <>
          {/* Models in this folder */}
          {node.models.map((m) => {
            const pageId = `${node.path}::${m.source_query}`
            const isSelected = selectedPath === pageId
            return (
              <button
                key={m.id}
                type='button'
                onClick={() => onSelect(pageId, m)}
                className={cn(
                  'flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm',
                  isSelected
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted text-muted-foreground'
                )}
                style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
              >
                <FileText className='size-4 shrink-0' />
                <span className='truncate'>{m.source_query}</span>
              </button>
            )
          })}

          {/* Subfolders */}
          {[...node.children.values()].map((child) => (
            <TreeFolder
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              expandedSet={expandedSet}
              toggleExpand={toggleExpand}
            />
          ))}
        </>
      )}
    </div>
  )
}

// --- Main component ---

export function KnowledgePagesView() {
  const { data, isLoading, isError } = useProviderMentalModels()
  const [selectedPath, setSelectedPath] = useState('')
  const [selectedModel, setSelectedModel] =
    useState<ProviderMentalModel | null>(null)
  const [expandedSet, setExpandedSet] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  const models = useMemo(() => data?.data ?? [], [data])

  const tree = useMemo(() => buildTree(models), [models])

  const filteredModels = useMemo(() => {
    if (!search.trim()) return models
    const q = search.toLowerCase()
    return models.filter(
      (m) =>
        m.source_query.toLowerCase().includes(q) ||
        m.scope_model.toLowerCase().includes(q) ||
        (m.tags || '').toLowerCase().includes(q) ||
        (m.content || '').toLowerCase().includes(q)
    )
  }, [models, search])

  function toggleExpand(path: string) {
    setExpandedSet((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  function onSelect(path: string, model: ProviderMentalModel) {
    setSelectedPath(path)
    setSelectedModel(model)
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className='space-y-3 py-4'>
          <Skeleton className='h-8 w-full' />
          <Skeleton className='h-8 w-full' />
          <Skeleton className='h-8 w-full' />
        </CardContent>
      </Card>
    )
  }

  if (isError) {
    return (
      <EmptyState
        icon={FileText}
        title='Failed to load knowledge pages'
        description='Check that the provider memory API is reachable.'
      />
    )
  }

  if (models.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title='Knowledge Pages'
        description='No mental models yet. Knowledge pages are living documents built from mental models. Run consolidation or create a mental model to populate the wiki.'
      />
    )
  }

  return (
    <div className='grid gap-4 lg:grid-cols-[280px_1fr]'>
      {/* Sidebar: folder tree + search */}
      <Card className='h-[600px]'>
        <CardHeader className='pb-3'>
          <CardTitle className='text-sm'>Pages</CardTitle>
          <div className='relative'>
            <Search className='text-muted-foreground absolute top-1/2 left-2 size-4 -translate-y-1/2' />
            <Input
              placeholder='Search pages...'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className='h-8 pl-8 text-sm'
            />
          </div>
        </CardHeader>
        <CardContent className='overflow-y-auto p-2'>
          {search.trim() ? (
            // Flat search results
            <div className='space-y-0.5'>
              {filteredModels.map((m) => {
                const pageId = `${m.tags || m.scope_model}::${m.source_query}`
                const isSelected = selectedPath === pageId
                return (
                  <button
                    key={m.id}
                    type='button'
                    onClick={() => onSelect(pageId, m)}
                    className={cn(
                      'flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm',
                      isSelected
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted text-muted-foreground'
                    )}
                  >
                    <FileText className='size-4 shrink-0' />
                    <span className='truncate'>{m.source_query}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <TreeFolder
              node={tree}
              depth={0}
              selectedPath={selectedPath}
              onSelect={onSelect}
              expandedSet={expandedSet}
              toggleExpand={toggleExpand}
            />
          )}
        </CardContent>
      </Card>

      {/* Main: page content */}
      <Card className='h-[600px]'>
        {selectedModel ? (
          <>
            <CardHeader className='border-b pb-3'>
              <div className='flex items-center gap-2'>
                <FileText className='text-primary size-5' />
                <CardTitle className='text-base'>
                  {selectedModel.source_query}
                </CardTitle>
                <Badge variant='outline' className='ml-auto font-mono text-xs'>
                  {selectedModel.scope_model}
                </Badge>
              </div>
              <div className='text-muted-foreground flex items-center gap-3 text-xs'>
                <span>
                  Refreshed:{' '}
                  {new Date(selectedModel.refreshed_at * 1000).toLocaleString()}
                </span>
                {selectedModel.auto_refresh && (
                  <Badge variant='secondary' className='gap-1 text-xs'>
                    <span className='size-1.5 rounded-full bg-emerald-500' />
                    Auto-refresh
                  </Badge>
                )}
                {selectedModel.tags && <span>Tags: {selectedModel.tags}</span>}
              </div>
            </CardHeader>
            <CardContent className='overflow-y-auto p-4'>
              {/* Content as markdown-like text */}
              {selectedModel.content ? (
                <div className='prose prose-sm dark:prose-invert max-w-none font-mono text-sm leading-relaxed break-words whitespace-pre-wrap'>
                  {selectedModel.content}
                </div>
              ) : (
                <p className='text-muted-foreground text-sm'>
                  No content yet. The consolidation job will populate this page
                  when observations are available.
                </p>
              )}

              {/* Payload (rankings JSON) */}
              {selectedModel.payload && selectedModel.payload !== '[]' && (
                <div className='mt-6'>
                  <h4 className='mb-2 text-sm font-semibold'>
                    Structured data (payload)
                  </h4>
                  <pre className='bg-muted overflow-x-auto rounded-lg p-3 text-xs'>
                    {(() => {
                      try {
                        return JSON.stringify(
                          JSON.parse(selectedModel.payload),
                          null,
                          2
                        )
                      } catch {
                        return selectedModel.payload
                      }
                    })()}
                  </pre>
                </div>
              )}
            </CardContent>
          </>
        ) : (
          <CardContent className='flex h-full items-center justify-center'>
            <EmptyState
              icon={FileText}
              title='Select a page'
              description='Choose a knowledge page from the sidebar to view its content.'
            />
          </CardContent>
        )}
      </Card>
    </div>
  )
}
