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
import {
  BookOpen,
  Brain,
  Database,
  Eye,
  Network,
  Settings,
  Sparkles,
  Zap,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { KnowledgePagesView } from './components/knowledge-pages-view'
import { MemoryActionsBar } from './components/memory-actions-bar'
import { MemoryConfigSection } from './components/memory-config-section'
import { MemoryFactsTable } from './components/memory-facts-table'
import { MemoryGraphView } from './components/memory-graph-view'
import { MemoryMentalModelsTable } from './components/memory-mental-models-table'
import { MemoryObservationsTable } from './components/memory-observations-table'
import { MemoryStatsCards } from './components/memory-stats-cards'

export function ProviderMemoryDashboard() {
  const { t } = useTranslation()

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        <span className='inline-flex min-w-0 items-center gap-2'>
          <Brain className='text-primary size-5' aria-hidden='true' />
          <span className='truncate'>{t('Provider Memory')}</span>
          <Badge variant='outline' className='shrink-0'>
            Root
          </Badge>
        </span>
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='space-y-6'>
          {/* Stats cards */}
          <MemoryStatsCards />

          {/* Actions bar */}
          <MemoryActionsBar />

          {/* Tabbed tables */}
          <Tabs defaultValue='facts'>
            <TabsList>
              <TabsTrigger value='knowledge-pages'>
                <BookOpen className='mr-1.5 size-4' aria-hidden='true' />
                {t('Knowledge Pages')}
              </TabsTrigger>
              <TabsTrigger value='graph'>
                <Network className='mr-1.5 size-4' aria-hidden='true' />
                {t('Memory Graph')}
              </TabsTrigger>
              <TabsTrigger value='facts'>
                <Database className='mr-1.5 size-4' aria-hidden='true' />
                {t('Facts')}
              </TabsTrigger>
              <TabsTrigger value='observations'>
                <Eye className='mr-1.5 size-4' aria-hidden='true' />
                {t('Observations')}
              </TabsTrigger>
              <TabsTrigger value='mental-models'>
                <Sparkles className='mr-1.5 size-4' aria-hidden='true' />
                {t('Mental Models')}
              </TabsTrigger>
              <TabsTrigger value='routing-hints'>
                <Zap className='mr-1.5 size-4' aria-hidden='true' />
                {t('Routing Hints')}
              </TabsTrigger>
              <TabsTrigger value='config'>
                <Settings className='mr-1.5 size-4' aria-hidden='true' />
                {t('Configuration')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value='knowledge-pages'>
              <KnowledgePagesView />
            </TabsContent>
            <TabsContent value='graph'>
              <MemoryGraphView />
            </TabsContent>
            <TabsContent value='facts'>
              <MemoryFactsTable />
            </TabsContent>
            <TabsContent value='observations'>
              <MemoryObservationsTable />
            </TabsContent>
            <TabsContent value='mental-models'>
              <MemoryMentalModelsTable />
            </TabsContent>
            <TabsContent value='routing-hints'>
              <Card>
                <CardHeader>
                  <CardTitle>{t('Routing Hints')}</CardTitle>
                  <CardDescription>
                    {t(
                      'Cached best-channel rankings per model. Falls back to global scope (*) when no model-specific model exists.'
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className='text-muted-foreground text-sm'>
                    {t(
                      'Use the API endpoint /api/provider-memory/routing-hint/latency?model=MODEL to query hints programmatically.'
                    )}
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value='config'>
              <MemoryConfigSection />
            </TabsContent>
          </Tabs>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
