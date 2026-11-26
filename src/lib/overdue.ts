// Overdue alerts: tasks open longer than the waiting threshold move to the top
// of their table, count in the tab title, and vibrate once when they first tip over.
import type { Task } from '../../shared/types'
import { WAITING_THRESHOLD_MIN, minutesBetween } from './time'

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 } as const

export function isOverdue(task: Task, now: number): boolean {
  return task.doneAt === null && minutesBetween(task.createdAt, now) >= WAITING_THRESHOLD_MIN
}

/** One table's open tasks: overdue first (longest wait first), then by priority and age. */
export function sortTableTasks(tasks: Task[], now: number): Task[] {
  return [...tasks].sort((a, b) => {
    const oa = isOverdue(a, now) ? 0 : 1
    const ob = isOverdue(b, now) ? 0 : 1
    if (oa !== ob) return oa - ob
    if (oa === 0) return a.createdAt - b.createdAt
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.createdAt - b.createdAt
  })
}

export function overdueCount(tasks: Task[], now: number): number {
  return tasks.filter((t) => isOverdue(t, now)).length
}

/** "(2) Waiterly", or "Waiterly" when nothing is overdue. */
export function tabTitle(count: number, base = 'Waiterly'): string {
  return count > 0 ? `(${count}) ${base}` : base
}

/**
 * Ids that became overdue since the last check. `seen` holds ids already reported
 * (mutated). On the first check (firstCheck true) everything already overdue is marked
 * seen without alerting, so opening the app doesn't buzz for old tasks.
 */
export function newlyOverdue(tasks: Task[], now: number, seen: Set<string>, firstCheck: boolean): string[] {
  const fresh: string[] = []
  for (const t of tasks) {
    if (!isOverdue(t, now) || seen.has(t.id)) continue
    seen.add(t.id)
    if (!firstCheck) fresh.push(t.id)
  }
  return fresh
}
