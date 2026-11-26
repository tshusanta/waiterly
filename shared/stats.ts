// Shift statistics, computed in code. The manager view shows them, and the AI
// summary receives *only* these numbers (no task text), so it has nothing to invent from.
import type { Category, ShiftState } from './types.js'
import { CATEGORIES } from './types.js'

export interface ShiftStats {
  shiftMinutes: number
  requests: number
  completed: number
  open: number
  completionRate: number // whole percent
  avgCompleteMin: number | null
  longestOpenWaitMin: number | null
  longestOpenTable: number | null
  safeguards: { allergy: number; soldOut: number; complaint: number; rejected: number; clarification: number }
  safeguardsTotal: number
  openAllergyTables: number[]
  byTable: { table: number; open: number; completed: number }[]
  byCategory: { category: Category; count: number }[]
}

const MIN = 60_000

export function computeStats(shift: ShiftState, now: number, sectionTables: number[]): ShiftStats {
  const tasks = shift.tasks
  const done = tasks.filter((t) => t.doneAt !== null)
  const open = tasks.filter((t) => t.doneAt === null)

  const durations = done.map((t) => (t.doneAt! - t.createdAt) / MIN)
  const avg = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null

  const oldestOpen = [...open].sort((a, b) => a.createdAt - b.createdAt)[0]

  const count = (kind: string) => shift.log.filter((e) => e.kind === kind).length
  const safeguards = {
    allergy: count('allergy'),
    soldOut: count('86d'),
    complaint: count('complaint'),
    rejected: count('rejected'),
    clarification: count('clarification'),
  }

  const tables = [...new Set([...sectionTables, ...tasks.map((t) => t.table)])].sort((a, b) => a - b)

  return {
    shiftMinutes: Math.max(0, Math.round((now - shift.startedAt) / MIN)),
    requests: tasks.length,
    completed: done.length,
    open: open.length,
    completionRate: tasks.length ? Math.round((done.length / tasks.length) * 100) : 0,
    avgCompleteMin: avg,
    longestOpenWaitMin: oldestOpen ? Math.max(0, Math.floor((now - oldestOpen.createdAt) / MIN)) : null,
    longestOpenTable: oldestOpen ? oldestOpen.table : null,
    safeguards,
    safeguardsTotal: Object.values(safeguards).reduce((a, b) => a + b, 0),
    openAllergyTables: [...new Set(open.filter((t) => t.flags.includes('allergy')).map((t) => t.table))].sort((a, b) => a - b),
    byTable: tables.map((table) => ({
      table,
      open: open.filter((t) => t.table === table).length,
      completed: done.filter((t) => t.table === table).length,
    })),
    byCategory: CATEGORIES.map((category) => ({ category, count: tasks.filter((t) => t.category === category).length }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count),
  }
}
