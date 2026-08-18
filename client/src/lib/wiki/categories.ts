import type { CategoryMeta } from './types'

// Display order for the wiki sidebar / category index — roughly mirrors the
// order a new user encounters these concerns: get running, then containers,
// then day-to-day config, then maintenance, then integrations, then depth.
export const CATEGORIES: CategoryMeta[] = [
  { id: 'getting-started', label: 'Getting Started', order: 0 },
  { id: 'docker', label: 'Docker', order: 1 },
  { id: 'mods', label: 'Mods', order: 2 },
  { id: 'templates', label: 'Templates', order: 3 },
  { id: 'backups', label: 'Backups', order: 4 },
  { id: 'scheduler', label: 'Scheduler', order: 5 },
  { id: 'discord', label: 'Discord', order: 6 },
  { id: 'advanced', label: 'Advanced', order: 7 },
]

export function getCategoryMeta(id: string): CategoryMeta | undefined {
  return CATEGORIES.find((c) => c.id === id)
}

export function getCategoryLabel(id: string): string {
  return getCategoryMeta(id)?.label ?? id
}
