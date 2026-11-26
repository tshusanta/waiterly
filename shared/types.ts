// Shared by the browser app and the /api functions. These const arrays are the
// whitelists that server-side validation checks model output against.

export const CATEGORIES = [
  'drinks',
  'condiments',
  'food',
  'check',
  'supplies',
  'cleanup',
  'service',
  'other',
] as const
export type Category = (typeof CATEGORIES)[number]

export const PRIORITIES = ['high', 'normal', 'low'] as const
export type Priority = (typeof PRIORITIES)[number]

export const FLAGS = ['allergy', '86d', 'complaint'] as const
export type Flag = (typeof FLAGS)[number]

/** quick = one-tap button on a table card (no AI, no review). */
export type TaskSource = 'ai' | 'fallback' | 'seed' | 'quick'

export interface Task {
  id: string
  table: number
  text: string
  category: Category
  priority: Priority
  flags: Flag[]
  note: string
  /** epoch ms */
  createdAt: number
  /** epoch ms, null while open */
  doneAt: number | null
  source: TaskSource
}

/** Entries for the manager's safeguard log. */
export type SafeguardKind = 'allergy' | '86d' | 'complaint' | 'rejected' | 'clarification'

export interface SafeguardEvent {
  id: string
  at: number
  kind: SafeguardKind
  table: number | null
  text: string
}

export interface Settings {
  assignedTables: number[]
}

export interface ShiftState {
  version: 1
  startedAt: number
  tasks: Task[]
  log: SafeguardEvent[]
}
