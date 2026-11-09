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

import { MemoryBankTabs } from './components/MemoryBankTabs'

export function AgentMemory() {
  const { t } = useTranslation()
  const [selectedBankId, setSelectedBankId] = useState<number | undefined>(undefined)

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        <span className='inline-flex min-w-0 items-center gap-2'>
          <span className='size-5' aria-hidden='true' />
          <span className='truncate'>{t('Agent Memory')}</span>
        </span>
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <MemoryBankTabs
          selectedBankId={selectedBankId}
          onBankSelect={setSelectedBankId}
        />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}