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
import { createSectionRegistry } from '@/features/system-settings/utils/section-registry'

const PROVIDER_MEMORY_SECTIONS = [
  {
    id: 'dashboard',
    titleKey: 'Dashboard',
    build: () => null, // Main page, no section component
  },
] as const

export type ProviderMemorySectionId = (typeof PROVIDER_MEMORY_SECTIONS)[number]['id']

const providerMemoryRegistry = createSectionRegistry<
  ProviderMemorySectionId,
  unknown,
  []
>({
  sections: PROVIDER_MEMORY_SECTIONS,
  defaultSection: 'dashboard',
  basePath: '/system-settings/provider-memory',
  urlStyle: 'path',
  // Override URL generation to point to base path (no sub-sections)
  getSectionNavItems: (t) => [
    {
      title: t('Dashboard'),
      url: '/system-settings/provider-memory/',
    },
  ],
})

export const PROVIDER_MEMORY_SECTION_IDS = providerMemoryRegistry.sectionIds
export const getProviderMemorySectionNavItems =
  providerMemoryRegistry.getSectionNavItems
export const getProviderMemorySectionContent =
  providerMemoryRegistry.getSectionContent