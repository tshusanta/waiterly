// One-tap requests on each table card. No AI call and no review: the server
// tapped the exact thing they want, so the task is added at once (with Undo).
import type { Category, Priority, Task } from './types.js'

export interface QuickTap {
  id: string
  label: string
  text: string
  category: Category
  priority: Priority
}

export const QUICK_TAPS: readonly QuickTap[] = [
  { id: 'water', label: 'Water', text: 'Bring water', category: 'drinks', priority: 'normal' },
  { id: 'check', label: 'Check', text: 'Bring check', category: 'check', priority: 'high' },
  { id: 'togo', label: 'To-go box', text: 'Bring to-go box', category: 'supplies', priority: 'normal' },
  { id: 'napkins', label: 'Napkins', text: 'Bring napkins', category: 'supplies', priority: 'normal' },
  { id: 'condiment', label: 'Condiment', text: 'Bring condiment', category: 'condiments', priority: 'normal' },
  { id: 'clear', label: 'Clear plates', text: 'Clear plates', category: 'cleanup', priority: 'normal' },
]

/** The task a quick tap adds. Throws on an unknown id (a programming error, not user input). */
export function quickTapTask(tapId: string, table: number, now: number, id: string): Task {
  const tap = QUICK_TAPS.find((q) => q.id === tapId)
  if (!tap) throw new Error(`Unknown quick tap: ${tapId}`)
  return {
    id,
    table,
    text: tap.text,
    category: tap.category,
    priority: tap.priority,
    flags: [],
    note: '',
    createdAt: now,
    doneAt: null,
    source: 'quick',
  }
}
