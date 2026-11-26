// Trip planning: types, the deterministic planner (fallback) and validation of
// AI plans. Shared by /api/plan and the browser's offline fallback.
import { cleanString } from './parse/text.js'
import { CATEGORIES, FLAGS, PRIORITIES, type Category, type Flag, type Priority } from './types.js'

export interface PlanTask {
  id: string
  table: number
  text: string
  category: Category
  priority: Priority
  flags: Flag[]
  waitMin: number
}

export interface Trip {
  title: string
  reason: string
  taskIds: string[]
}

export interface PlanResponse {
  source: 'ai' | 'fallback'
  reason?: 'not_configured' | 'ai_error'
  trips: Trip[]
  notice?: string
}

export const MAX_TRIPS = 3
const MAX_PER_TRIP = 6

export const STATIONS: Record<Category, string> = {
  drinks: 'Drink station',
  condiments: 'Side station',
  supplies: 'Side station',
  food: 'Kitchen pass',
  check: 'POS',
  cleanup: 'Bus station',
  service: 'Floor',
  other: 'Floor',
}

/** 0 is most urgent: allergies, then complaints, then checks, then everything else. */
export function urgency(t: Pick<PlanTask, 'flags' | 'category'>): number {
  if (t.flags.includes('allergy')) return 0
  if (t.flags.includes('complaint')) return 1
  if (t.category === 'check') return 2
  return 3
}

const byUrgencyThenWait = (a: PlanTask, b: PlanTask) => urgency(a) - urgency(b) || b.waitMin - a.waitMin

function tablesLabel(tasks: PlanTask[]): string {
  const tables = [...new Set(tasks.map((t) => t.table))]
  return tables.length === 1 ? `Table ${tables[0]}` : `Tables ${tables.join(', ')}`
}

function reasonFor(lead: PlanTask, count: number): string {
  const why =
    urgency(lead) === 0
      ? `Allergy check at table ${lead.table}. Confirm with kitchen first.`
      : urgency(lead) === 1
        ? `Complaint at table ${lead.table}. Handle it before it grows.`
        : urgency(lead) === 2
          ? `Table ${lead.table} is waiting on their check.`
          : `Longest wait: table ${lead.table}, ${lead.waitMin} min.`
  return count > 1 ? `${why} Covers ${count} tasks in one trip.` : why
}

/** Deterministic plan: urgent first, then longest waits, grouped by station. */
export function fallbackPlan(tasks: PlanTask[]): Trip[] {
  const sorted = [...tasks].sort(byUrgencyThenWait)
  const assigned = new Set<string>()
  const trips: Trip[] = []
  for (const lead of sorted) {
    if (trips.length === MAX_TRIPS) break
    if (assigned.has(lead.id)) continue
    const station = STATIONS[lead.category]
    const group = sorted.filter((t) => !assigned.has(t.id) && STATIONS[t.category] === station).slice(0, MAX_PER_TRIP)
    group.forEach((t) => assigned.add(t.id))
    trips.push({ title: `${station}: ${tablesLabel(group)}`, reason: reasonFor(lead, group.length), taskIds: group.map((t) => t.id) })
  }
  return trips
}

export class PlanShapeError extends Error {}

/** Validate an AI plan: real task ids only, each used once, at most 3 trips, urgent trips first. */
export function validatePlan(raw: unknown, tasks: PlanTask[]): Trip[] {
  const r = raw as { trips?: unknown }
  if (!r || typeof r !== 'object' || !Array.isArray(r.trips)) throw new PlanShapeError('No trips array')
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const used = new Set<string>()
  const trips: Trip[] = []
  for (const item of r.trips.slice(0, 10)) {
    const t = item as Record<string, unknown>
    const ids: string[] = []
    for (const id of Array.isArray(t?.task_ids) ? t.task_ids : []) {
      if (ids.length === MAX_PER_TRIP) break
      if (typeof id !== 'string' || !byId.has(id) || used.has(id)) continue
      used.add(id) // also blocks repeats inside this same trip
      ids.push(id)
    }
    if (ids.length === 0) continue
    trips.push({
      title: cleanString(t.title, 60) || `Trip ${trips.length + 1}`,
      reason: cleanString(t.reason, 160),
      taskIds: ids,
    })
  }
  if (trips.length === 0) throw new PlanShapeError('No valid trips')
  const leadUrgency = (trip: Trip) => Math.min(...trip.taskIds.map((id) => urgency(byId.get(id)!)))
  return trips.sort((a, b) => leadUrgency(a) - leadUrgency(b)).slice(0, MAX_TRIPS)
}

/** Sanitize plan input from the client. */
export function readPlanTasks(value: unknown): PlanTask[] {
  if (!Array.isArray(value)) return []
  const out: PlanTask[] = []
  for (const v of value.slice(0, 50)) {
    const t = v as Record<string, unknown>
    const id = typeof t?.id === 'string' ? t.id.slice(0, 64) : ''
    const table = Number(t?.table)
    const text = cleanString(t?.text, 80)
    if (!id || !Number.isInteger(table) || !text) continue
    out.push({
      id,
      table,
      text,
      category: (CATEGORIES as readonly string[]).includes(t.category as string) ? (t.category as Category) : 'other',
      priority: (PRIORITIES as readonly string[]).includes(t.priority as string) ? (t.priority as Priority) : 'normal',
      flags: Array.isArray(t.flags) ? FLAGS.filter((f) => (t.flags as unknown[]).includes(f)) : [],
      waitMin: Math.max(0, Math.min(600, Math.round(Number(t.waitMin) || 0))),
    })
  }
  return out
}
