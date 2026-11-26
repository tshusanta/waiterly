// Manager shift summary: input sanitizing, the deterministic fallback, and
// validation of AI output. The number check is the key safeguard: every number the
// AI writes must appear in the stats it was given, or that line is dropped.
import { cleanString } from './parse/text.js'
import type { ShiftStats } from './stats.js'
import { CATEGORIES, type Category } from './types.js'

export interface ShiftSummary {
  headline: string
  insights: string[]
  action: string
}

export const NEEDS_KEY_NOTICE = 'AI summary needs an API key. Showing a summary written from the shift stats instead.'

export interface SummaryResponse extends ShiftSummary {
  source: 'ai' | 'fallback'
  reason?: 'not_configured' | 'ai_error'
  notice?: string
}

const int = (v: unknown, max = 10_000) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0
}
const intOrNull = (v: unknown, max = 10_000) => (v === null || v === undefined ? null : int(v, max))

/** Rebuild stats from untrusted JSON: numbers and known category names only. */
export function readStats(raw: unknown): ShiftStats | null {
  const s = raw as Record<string, unknown>
  if (!s || typeof s !== 'object') return null
  const sg = (s.safeguards ?? {}) as Record<string, unknown>
  const safeguards = {
    allergy: int(sg.allergy),
    soldOut: int(sg.soldOut),
    complaint: int(sg.complaint),
    rejected: int(sg.rejected),
    clarification: int(sg.clarification),
  }
  return {
    shiftMinutes: int(s.shiftMinutes, 24 * 60),
    requests: int(s.requests),
    completed: int(s.completed),
    open: int(s.open),
    completionRate: int(s.completionRate, 100),
    avgCompleteMin: intOrNull(s.avgCompleteMin, 600),
    longestOpenWaitMin: intOrNull(s.longestOpenWaitMin, 600),
    longestOpenTable: intOrNull(s.longestOpenTable, 99),
    safeguards,
    safeguardsTotal: Object.values(safeguards).reduce((a, b) => a + b, 0),
    openAllergyTables: (Array.isArray(s.openAllergyTables) ? s.openAllergyTables : []).slice(0, 10).map((t) => int(t, 99)),
    byTable: (Array.isArray(s.byTable) ? s.byTable : []).slice(0, 12).map((r) => {
      const row = r as Record<string, unknown>
      return { table: int(row?.table, 99), open: int(row?.open), completed: int(row?.completed) }
    }),
    byCategory: (Array.isArray(s.byCategory) ? s.byCategory : [])
      .map((r) => r as Record<string, unknown>)
      .filter((r) => (CATEGORIES as readonly string[]).includes(r?.category as string))
      .slice(0, CATEGORIES.length)
      .map((r) => ({ category: r.category as Category, count: int(r.count) })),
  }
}

/** Every number that legitimately appears in the stats (plus 86, as in "86'd"). */
export function allowedNumbers(stats: ShiftStats): Set<number> {
  const out = new Set<number>([86])
  const walk = (v: unknown) => {
    if (typeof v === 'number') out.add(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(stats)
  return out
}

export function numbersIn(text: string): number[] {
  return [...text.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Deterministic summary written from the stats. Used when AI is unavailable. */
export function fallbackSummary(s: ShiftStats): ShiftSummary {
  const totalOf = (r: ShiftStats['byTable'][number]) => r.open + r.completed
  const activeTables = s.byTable.filter((r) => totalOf(r) > 0)
  const maxRequests = Math.max(0, ...activeTables.map(totalOf))
  const busiest = activeTables.filter((r) => totalOf(r) === maxRequests)
  const topCount = s.byCategory[0]?.count ?? 0
  const topCategories = s.byCategory.filter((c) => c.count === topCount)
  const insights: string[] = []
  // Ties are stated as ties. Never crown one table or type when several share the top spot.
  if (busiest.length === 1) {
    insights.push(`Table ${busiest[0].table} is the busiest with ${plural(maxRequests, 'request')}.`)
  } else if (busiest.length > 1 && busiest.length === activeTables.length) {
    insights.push(`Requests are spread evenly: ${plural(maxRequests, 'request')} per table.`)
  } else if (busiest.length > 1) {
    insights.push(`Tables ${busiest.map((r) => r.table).join(' and ')} are busiest with ${plural(maxRequests, 'request')} each.`)
  }
  if (topCategories.length === 1) insights.push(`Most requests are ${topCategories[0].category} (${topCount}).`)
  else if (topCategories.length > 1) {
    insights.push(`Top request types: ${topCategories.map((c) => c.category).join(', ')} (${topCount} each).`)
  }
  if (s.longestOpenWaitMin !== null && s.longestOpenTable !== null) {
    insights.push(`Longest open wait is ${s.longestOpenWaitMin} min at table ${s.longestOpenTable}.`)
  }
  if (s.safeguardsTotal > 0) {
    insights.push(
      `${plural(s.safeguardsTotal, 'safeguard')} triggered: ${s.safeguards.allergy} allergy, ${s.safeguards.soldOut} sold-out, ${s.safeguards.complaint} complaint, ${s.safeguards.rejected} rejected, ${s.safeguards.clarification} ${s.safeguards.clarification === 1 ? 'question' : 'questions'}.`,
    )
  }

  const action = s.openAllergyTables.length
    ? `Confirm the open allergy check at table ${s.openAllergyTables.join(', ')} with the kitchen.`
    : s.longestOpenWaitMin !== null && s.longestOpenWaitMin >= 5
      ? `Get to table ${s.longestOpenTable}. They have waited ${s.longestOpenWaitMin} min.`
      : 'Service is on pace. Keep checking back every few minutes.'

  return {
    headline: `${plural(s.requests, 'request')} this shift, ${s.completed} done${s.avgCompleteMin !== null ? `, ${s.avgCompleteMin} min average` : ''}.`,
    insights: insights.slice(0, 4),
    action,
  }
}

export class SummaryShapeError extends Error {}

/** Validate AI output. Drops any line with a number not in the stats; throws if the result is unusable. */
export function validateSummary(raw: unknown, stats: ShiftStats): { summary: ShiftSummary; dropped: number } {
  const r = raw as Record<string, unknown>
  if (!r || typeof r !== 'object') throw new SummaryShapeError('Not an object')
  const allowed = allowedNumbers(stats)
  const honest = (text: string) => numbersIn(text).every((n) => allowed.has(n))
  const fallback = fallbackSummary(stats)
  let dropped = 0

  let headline = cleanString(r.headline, 120)
  if (!headline || !honest(headline)) {
    if (headline) dropped++
    headline = fallback.headline
  }
  const insights: string[] = []
  for (const line of Array.isArray(r.insights) ? r.insights.slice(0, 6) : []) {
    const text = cleanString(line, 180)
    if (!text) continue
    if (honest(text)) insights.push(text)
    else dropped++
  }
  let action = cleanString(r.action, 160)
  if (!action || !honest(action)) {
    if (action) dropped++
    action = fallback.action
  }
  if (insights.length === 0) throw new SummaryShapeError('No usable insights')
  return { summary: { headline, insights: insights.slice(0, 4), action }, dropped }
}
