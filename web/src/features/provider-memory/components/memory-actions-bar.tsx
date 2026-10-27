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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Play, Trash } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

import { useConsolidateProviderFacts, usePruneOldProviderFacts } from '../hooks'

export function MemoryActionsBar() {
  const { t } = useTranslation()
  const consolidate = useConsolidateProviderFacts()
  const prune = usePruneOldProviderFacts()
  const [pruneTs, setPruneTs] = useState('')

  function handlePrune() {
    const ts = pruneTs ? Number(pruneTs) : Math.floor(Date.now() / 1000)
    prune.mutate(ts)
    setPruneTs('')
  }

  return (
    <div className='flex flex-wrap items-center gap-3'>
      <Button
        variant='outline'
        onClick={() => consolidate.mutate()}
        disabled={consolidate.isPending}
      >
        <Play className='mr-1.5 size-4' aria-hidden='true' />
        {t('Run consolidation')}
      </Button>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant='outline'>
            <Trash className='mr-1.5 size-4' aria-hidden='true' />
            {t('Prune old facts')}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Prune old facts')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'Enter a Unix timestamp. All facts retained before this time will be deleted. Leave empty to use the current time.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            type='number'
            className='border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm'
            placeholder={String(Math.floor(Date.now() / 1000))}
            value={pruneTs}
            onChange={(e) => setPruneTs(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handlePrune}>
              {t('Prune')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}