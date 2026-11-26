// Rule-based "smart suggestion". Instant, free, runs on every render.
import type { Task } from '../../shared/types'
import { STATIONS } from '../../shared/plan'
import { formatWait, minutesBetween, WAITING_THRESHOLD_MIN } from './time'

function joinTables(tables: number[]): string {
  if (tables.length === 1) return `Table ${tables[0]}`
  return `Tables ${tables.slice(0, -1).join(', ')} and ${tables[tables.length - 1]}`
}

const GROUP_LABEL: Partial<Record<Task['category'], string>> = {
  drinks: 'drinks',
  condiments: 'sides or sauces',
  supplies: 'supplies',
}

export function suggestion(open: Task[], now: number): string {
  if (open.length === 0) return 'All caught up. Nothing open in your section.'

  const allergy = open.find((t) => t.flags.includes('allergy'))
  if (allergy) return `Table ${allergy.table} has an allergy check open. Confirm with the kitchen before anything else.`

  const complaint = open.find((t) => t.flags.includes('complaint'))
  if (complaint) return `Table ${complaint.table} has a complaint open. Get there or send a manager first.`

  for (const category of ['drinks', 'condiments', 'supplies'] as const) {
    const tables = [...new Set(open.filter((t) => t.category === category).map((t) => t.table))].sort((a, b) => a - b)
    if (tables.length >= 2) {
      return `${joinTables(tables)} ${tables.length === 2 ? 'both' : 'all'} need ${GROUP_LABEL[category]}. One trip to the ${STATIONS[category].toLowerCase()}.`
    }
  }

  const oldest = [...open].sort((a, b) => a.createdAt - b.createdAt)[0]
  const wait = minutesBetween(oldest.createdAt, now)
  if (wait >= WAITING_THRESHOLD_MIN) {
    return `Table ${oldest.table} has waited ${formatWait(wait)} for "${oldest.text.toLowerCase()}".`
  }

  const check = open.find((t) => t.category === 'check')
  if (check) return `Table ${check.table} is waiting on their check.`

  return `${open.length} open ${open.length === 1 ? 'task' : 'tasks'}, nothing urgent.`
}
