// The check card's state, for typed notes and table visits alike.
// Rule: one unclear or unavailable item never blocks the rest. Every item is in
// exactly one state (itemState), ready items are sent on one tap, and each held
// item is sent the moment it is fixed. Pure functions, so all of it is unit tested.
import { cleanTaskText, coveredByTasks } from '../../shared/parse/text'
import type { Clarification, OpenTaskRef, ParseResponse, Rejection } from '../../shared/parse/types'
import { enforceRules } from '../../shared/parse/validate'
import { chooseTable } from '../../shared/visit/tables'
import type { TableCorrection, VisitResponse, VisitTask } from '../../shared/visit/types'

export interface VerifyRow extends VisitTask {
  key: string
}

export interface VerifyMismatch {
  key: string
  rowKey: string
  guest: string
  readBack: string
  choice: 'guest' | 'readBack' | null
}

export interface VerifyState {
  kind: 'note' | 'visit'
  source: 'ai' | 'fallback'
  notice?: string
  /** Table card the visit started from, or null (main mic / typed note). */
  startTable: number | null
  /** Items not sent yet: ready or held. */
  rows: VerifyRow[]
  /** Items already sent to their tables (for "Copy for POS"). */
  sent: VerifyRow[]
  changes: string[]
  mismatches: VerifyMismatch[]
  tableCorrections: TableCorrection[]
  /** Questions with no item attached (nothing to send, only to answer). */
  questions: Clarification[]
  rejected: Rejection[]
  alreadyOpen: OpenTaskRef[]
  trimmed: boolean
}

/**
 * READY: clear section table, available item, nothing to choose.
 * HELD-MISMATCH: guest and read-back disagree (checked first: the text isn't final).
 * HELD-UNAVAILABLE: sold out or not on the menu.
 * HELD-TABLE: no clear table (missing, conflict, or not a section table).
 * ALREADY-OPEN items never become rows; they're listed in state.alreadyOpen.
 */
export type ItemState = 'ready' | 'held-mismatch' | 'held-unavailable' | 'held-table'

export function itemState(state: VerifyState, row: VerifyRow, section: number[]): ItemState {
  if (state.mismatches.some((m) => m.rowKey === row.key && m.choice === null)) return 'held-mismatch'
  if (row.unavailable) return 'held-unavailable'
  if (row.tableStatus !== 'ok' || row.table === null || !section.includes(row.table)) return 'held-table'
  return 'ready'
}

export function splitRows(state: VerifyState, section: number[]): { ready: VerifyRow[]; held: VerifyRow[] } {
  const ready: VerifyRow[] = []
  const held: VerifyRow[] = []
  for (const r of state.rows) (itemState(state, r, section) === 'ready' ? ready : held).push(r)
  return { ready, held }
}

const noTable = (message: string) => ({
  table: null, tableSource: 'none' as const, tableStatus: 'missing' as const, tableOptions: [], heardTable: null, tableMessage: message, changes: [],
})

/**
 * A "Which table?" question about a real request becomes a HELD-TABLE item, so the
 * server can tap a table instead of retyping. A question about a request that is
 * already a task (or already open) is dropped: an item is never both ready and held.
 */
function clarificationRows(
  clarifications: Clarification[],
  taken: string[],
  makeKey: () => string,
): { rows: VerifyRow[]; questions: Clarification[] } {
  const rows: VerifyRow[] = []
  const questions: Clarification[] = []
  for (const c of clarifications) {
    const text = cleanTaskText(c.request, 10)
    if (text && coveredByTasks(text, [...taken, ...rows.map((r) => r.text)])) continue
    if (!text) {
      if (!questions.some((q) => q.question === c.question)) questions.push(c)
      continue
    }
    const checked = enforceRules({ text, category: 'other' as const, priority: 'normal' as const, flags: [], note: '' })
    rows.push({ ...checked, ...noTable(c.question), key: makeKey() })
  }
  return { rows, questions }
}

function alreadyOpenFrom(res: { alreadyOpen?: OpenTaskRef[]; skipped: string[] }): OpenTaskRef[] {
  if (res.alreadyOpen) return res.alreadyOpen
  // Older responses: "Table 4: Bring ranch (already open)".
  return res.skipped.flatMap((s) => {
    const m = s.match(/^Table (\d+): (.*?)(?: \(already open\))?$/)
    return m ? [{ table: Number(m[1]), text: m[2] }] : []
  })
}

/** A typed note: the note validator already checked tables, so its tasks are ready unless unavailable. */
export function fromParseResponse(res: ParseResponse, makeKey: () => string): VerifyState {
  const tasks: VerifyRow[] = res.tasks.map((t) => ({
    ...t,
    key: makeKey(),
    tableSource: 'spoken',
    tableStatus: 'ok',
    tableOptions: [],
    heardTable: null,
    tableMessage: '',
    changes: [],
  }))
  const alreadyOpen = alreadyOpenFrom(res)
  const extra = clarificationRows(res.needs_clarification, [...tasks, ...alreadyOpen].map((t) => t.text), makeKey)
  return {
    kind: 'note',
    source: res.source,
    notice: res.notice,
    startTable: null,
    rows: [...tasks, ...extra.rows],
    sent: [],
    changes: [],
    mismatches: [],
    tableCorrections: [],
    questions: extra.questions,
    rejected: res.rejected,
    alreadyOpen,
    trimmed: false,
  }
}

export function fromVisitResponse(res: VisitResponse, startTable: number | null, makeKey: () => string): VerifyState {
  // A table outside the section is a red rejection, never a row (older responses sent it as a task).
  const outside = res.tasks.filter((t) => t.tableStatus === 'outside')
  const keep = res.tasks.map((t, i) => ({ t, i })).filter(({ t }) => t.tableStatus !== 'outside')
  const tasks: VerifyRow[] = keep.map(({ t }) => ({ ...t, key: makeKey() }))
  const keyAt = new Map(keep.map(({ i }, n) => [i, tasks[n].key]))
  const alreadyOpen = alreadyOpenFrom(res)
  const extra = clarificationRows(res.needs_clarification, [...tasks, ...alreadyOpen].map((t) => t.text), makeKey)
  return {
    kind: 'visit',
    source: res.source,
    notice: res.notice,
    startTable,
    rows: [...tasks, ...extra.rows],
    sent: [],
    changes: res.changes,
    mismatches: res.mismatches
      .filter((m) => keyAt.has(m.taskIndex))
      .map((m) => ({ key: makeKey(), rowKey: keyAt.get(m.taskIndex)!, guest: m.guest, readBack: m.readBack, choice: null })),
    tableCorrections: res.tableCorrections,
    questions: extra.questions,
    rejected: [
      ...res.rejected,
      ...outside.map((t) => ({ request: `Table ${t.heardTable}: ${t.text}`, reason: `Table ${t.heardTable} is not in your section.` })),
    ],
    alreadyOpen,
    trimmed: res.trimmed,
  }
}

export function setRowTable(state: VerifyState, rowKey: string, table: number | null, section: number[]): VerifyState {
  return { ...state, rows: state.rows.map((r) => (r.key === rowKey ? chooseTable(r, table, section) : r)) }
}

/**
 * A table button on a held item. For a conflict ("You started on Table 4 but said
 * table 1"), the answer applies to every item with the same question, so the server
 * answers once.
 */
export function resolveConflict(state: VerifyState, rowKey: string, table: number, section: number[]): VerifyState {
  const row = state.rows.find((r) => r.key === rowKey)
  if (!row) return state
  const same = (r: VerifyRow) =>
    r.key === rowKey ||
    (row.tableStatus === 'conflict' && r.tableStatus === 'conflict' && r.tableOptions.join() === row.tableOptions.join())
  return { ...state, rows: state.rows.map((r) => (same(r) ? chooseTable(r, table, section) : r)) }
}

export function setRowText(state: VerifyState, rowKey: string, text: string): VerifyState {
  return { ...state, rows: state.rows.map((r) => (r.key === rowKey ? { ...r, text } : r)) }
}

export function removeRow(state: VerifyState, rowKey: string): VerifyState {
  return {
    ...state,
    rows: state.rows.filter((r) => r.key !== rowKey),
    mismatches: state.mismatches.filter((m) => m.rowKey !== rowKey),
  }
}

/** Pick the guest's version or the read-back. The task text follows the choice. */
export function chooseMismatch(state: VerifyState, key: string, choice: 'guest' | 'readBack'): VerifyState {
  const m = state.mismatches.find((x) => x.key === key)
  if (!m) return state
  const text = cleanTaskText(choice === 'guest' ? m.guest : m.readBack, 10)
  return {
    ...state,
    mismatches: state.mismatches.map((x) => (x.key === key ? { ...x, choice } : x)),
    rows: state.rows.map((r) => (r.key === m.rowKey && text ? { ...r, ...enforceRules({ ...r, text }) } : r)),
  }
}

/** "Replace" on an unavailable item: the substitute becomes an ordinary order. */
export function replaceUnavailable(state: VerifyState, rowKey: string, substitute: string): VerifyState {
  const sub = substitute.trim()
  if (!cleanTaskText(sub, 8)) return state
  const text = cleanTaskText(/^(bring|get|add|order)\b/i.test(sub) ? sub : `Bring ${sub}`, 10)
  return {
    ...state,
    rows: state.rows.map((r) => {
      if (r.key !== rowKey) return r
      const { unavailable: _gone, ...rest } = r
      const checked = enforceRules({ ...rest, text, category: 'food', flags: r.flags.filter((f) => f !== '86d') })
      // Still unavailable (another sold-out item picked)? enforceRules marks it again.
      return { ...rest, ...checked }
    }),
  }
}

/** Move these rows from "not sent" to "sent". Their mismatches go with them. */
function markSent(state: VerifyState, keys: Set<string>): { state: VerifyState; sent: VerifyRow[] } {
  const sent = state.rows.filter((r) => keys.has(r.key))
  if (!sent.length) return { state, sent }
  return {
    state: {
      ...state,
      rows: state.rows.filter((r) => !keys.has(r.key)),
      sent: [...state.sent, ...sent],
      mismatches: state.mismatches.filter((m) => !keys.has(m.rowKey)),
    },
    sent,
  }
}

/** "Send ready items (N)": only the READY items, nothing else. */
export function takeReady(state: VerifyState, section: number[]): { state: VerifyState; sent: VerifyRow[] } {
  return markSent(state, new Set(splitRows(state, section).ready.map((r) => r.key)))
}

/**
 * After a fix on the card: every item that was held before and is ready now is sent
 * at once. Items that were already ready wait for "Send ready items".
 */
export function takeFixed(before: VerifyState, after: VerifyState, section: number[]): { state: VerifyState; sent: VerifyRow[] } {
  const wasHeld = new Set(before.rows.filter((r) => itemState(before, r, section) !== 'ready').map((r) => r.key))
  const fixed = after.rows.filter((r) => wasHeld.has(r.key) && itemState(after, r, section) === 'ready')
  return markSent(after, new Set(fixed.map((r) => r.key)))
}

/** Nothing left to send or answer: the card can close. */
export function isFinished(state: VerifyState): boolean {
  return state.rows.length === 0 && state.questions.length === 0
}

/** A question with no item attached, answered or not needed. */
export function dismissQuestion(state: VerifyState, index: number): VerifyState {
  return { ...state, questions: state.questions.filter((_, i) => i !== index) }
}
