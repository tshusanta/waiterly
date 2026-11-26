// Server-side validation of parser output (from the AI or the fallback).
// The prompt asks the model to follow the rules. This code enforces them anyway,
// so a model mistake can't put a wrong table, an unflagged allergy or a payment
// action on the server's screen.
import { RESTAURANT } from '../restaurant.js'
import { CATEGORIES, FLAGS, PRIORITIES, type Category, type Flag, type Priority } from '../types.js'
import { cleanString, cleanTaskText, coveredByTasks, dedupeTokens, isNearDuplicate, mentionedNumbers } from './text.js'
import {
  ALLERGY_NOTE,
  MAX_TASKS,
  type Clarification,
  type DraftTask,
  type OpenTaskRef,
  type Unavailable,
  type ParseContext,
  type ParseResult,
  type Rejection,
} from './types.js'

export class ParseShapeError extends Error {}

export const ALLERGY_RE =
  /allerg|anaphyla|gluten|celiac|coeliac|dairy[- ]free|lactose|peanut|tree ?nut|nut[- ]free|shellfish|sesame|vegan|vegetarian|kosher|halal/i
const COMPLAINT_RE = /complain|\bmanager\b|overcooked|undercooked|burnt|burned|wrong order|rude/i
export const PAYMENT_RE =
  /\b(mark\w*|set|make)\b.*\b(paid|comped?|free)\b|\b(refund|void|comp|discount|chargeback)\b/i
const TELL_GUEST_RE = /86|sold out|tell|let .* know|unavailable|out of/i
const SAFETY_CLAIM_RE = /\b(is|are|it's|its)\s+(safe|fine|ok|okay)\b|\bno (peanuts?|nuts|gluten|dairy|shellfish|sesame)\b/i
const VERIFY_RE = /\b(ask|check|confirm|verify)\b/i

export function pick<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value.toLowerCase())
    ? (value.toLowerCase() as T)
    : fallback
}

export function toInt(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isInteger(n) ? n : null
}

function soldOutItemIn(text: string): string | null {
  const lower = text.toLowerCase()
  return RESTAURANT.soldOut.find((item) => lower.includes(item)) ?? null
}

/**
 * The model's "unavailable" field, checked in code. Only a food item that shares no
 * word with the menu counts as "not on the menu" (drinks aren't listed, so a Coke is
 * never refused). Sold-out items are found by enforceRules from the text itself.
 */
export function notOnMenu(value: unknown, category: string): Unavailable | undefined {
  const item = cleanString(value, 40).toLowerCase()
  if (!item || category !== 'food' || soldOutItemIn(item)) return undefined
  const words = dedupeTokens(item)
  const onMenu = RESTAURANT.menu.some((m) => [...dedupeTokens(m)].some((w) => words.has(w)))
  return onMenu ? undefined : { item, reason: 'not_on_menu' }
}

/** Drop "Which table?" questions about a request that already became a task. */
export function dropCovered(clarifications: Clarification[], taskTexts: string[]): Clarification[] {
  return clarifications.filter((c) => !c.request || !coveredByTasks(c.request, taskTexts))
}

/** Apply the safety rules in code to one task already known to be in the section. */
export function enforceRules<T extends Omit<DraftTask, 'table'>>(task: T): T {
  const flags = new Set<Flag>(task.flags)
  let { text, priority, note, category } = task

  // Rule 6: sold-out item. Never an order task, always a "tell the guest" task.
  const soldOut = soldOutItemIn(text)
  let unavailable = task.unavailable
  if (soldOut) {
    flags.add('86d')
    unavailable = { item: soldOut, reason: 'sold_out' }
    if (!TELL_GUEST_RE.test(text)) {
      text = cleanTaskText(`Tell guest ${soldOut} is 86'd`)
      category = 'service'
    }
  }

  // Rule 5: allergies and dietary needs. High priority, kitchen note, never "it's safe".
  if (flags.has('allergy') || ALLERGY_RE.test(text) || ALLERGY_RE.test(note)) {
    flags.add('allergy')
    priority = 'high'
    note = ALLERGY_NOTE
    if (SAFETY_CLAIM_RE.test(text) && !VERIFY_RE.test(text)) text = 'Confirm allergy with kitchen'
  }

  // Rule 7: complaints and checks are high priority.
  if (COMPLAINT_RE.test(text)) flags.add('complaint')
  if (flags.has('complaint') || category === 'check') priority = 'high'

  const out = { ...task, text, category, priority, note, flags: FLAGS.filter((f) => flags.has(f)) }
  if (unavailable) out.unavailable = unavailable
  return out
}

/**
 * Validate and sanitize raw parser output. Throws ParseShapeError if the shape is
 * unusable, which makes the endpoint switch to the fallback parser.
 */
export function validateParseResult(raw: unknown, ctx: ParseContext): ParseResult {
  if (!raw || typeof raw !== 'object') throw new ParseShapeError('Output is not an object')
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.tasks)) throw new ParseShapeError('Output has no tasks array')

  const section = ctx.assignedTables
  const mentioned = mentionedNumbers(ctx.note)
  const tasks: DraftTask[] = []
  const clarifications: Clarification[] = []
  const rejected: Rejection[] = []
  const skipped: string[] = []

  for (const item of r.tasks.slice(0, 40)) {
    if (!item || typeof item !== 'object') continue
    const t = item as Record<string, unknown>
    const text = cleanTaskText(t.text)
    if (!text) continue
    const table = toInt(t.table)

    // Rule 8 in code: no payment or comp actions, whatever the model says.
    if (PAYMENT_RE.test(text)) {
      rejected.push({ request: text, reason: "Not a guest request. Waiterly can't change payments or comps." })
      continue
    }
    // Rule 2 in code: the table must actually appear in the note.
    if (table === null || !mentioned.has(table)) {
      clarifications.push({ request: text, question: `Which table is "${text}" for?` })
      continue
    }
    // Rule 4 in code: the table must be in the server's section.
    if (!section.includes(table)) {
      rejected.push({
        request: `Table ${table}: ${text}`,
        reason: `Table ${table} is not in your section (${section.join(', ')}).`,
      })
      continue
    }

    const category = pick<Category>(CATEGORIES, t.category, 'other')
    tasks.push(
      enforceRules({
        table,
        text,
        category,
        ...(notOnMenu(t.unavailable, category) ? { unavailable: notOnMenu(t.unavailable, category) } : {}),
        priority: pick<Priority>(PRIORITIES, t.priority, 'normal'),
        flags: Array.isArray(t.flags)
          ? FLAGS.filter((f) => (t.flags as unknown[]).some((x) => typeof x === 'string' && x.toLowerCase() === f))
          : [],
        note: cleanString(t.note, 120),
      }),
    )
  }

  // Duplicates within this note, and against tasks that are already open.
  const unique: DraftTask[] = []
  const alreadyOpen: OpenTaskRef[] = []
  for (const task of tasks) {
    const dupOpen = ctx.openTasks.some((o) => o.table === task.table && isNearDuplicate(o.text, task.text))
    const dupBatch = unique.some((u) => u.table === task.table && isNearDuplicate(u.text, task.text))
    if (dupOpen) {
      skipped.push(`Table ${task.table}: ${task.text} (already open)`)
      alreadyOpen.push({ table: task.table, text: task.text })
    } else if (!dupBatch) unique.push(task)
  }

  for (const c of Array.isArray(r.needs_clarification) ? r.needs_clarification.slice(0, 10) : []) {
    const q = cleanString((c as Record<string, unknown>)?.question, 140)
    if (q) clarifications.push({ request: cleanString((c as Record<string, unknown>)?.request, 120), question: q })
  }
  for (const x of Array.isArray(r.rejected) ? r.rejected.slice(0, 10) : []) {
    const reason = cleanString((x as Record<string, unknown>)?.reason, 140)
    if (reason) rejected.push({ request: cleanString((x as Record<string, unknown>)?.request, 120), reason })
  }

  // One item is never both a task and a "Which table?" question (the model sometimes
  // returns both for "2 waters and napkins"). Already-open items aren't questions either.
  const kept = unique.slice(0, MAX_TASKS)
  const done = [...kept, ...alreadyOpen].map((t) => t.text)
  return {
    tasks: kept,
    needs_clarification: dropCovered(clarifications, done).slice(0, 10),
    rejected: rejected.slice(0, 10),
    skipped,
    alreadyOpen,
  }
}
