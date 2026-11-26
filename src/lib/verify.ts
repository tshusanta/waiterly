// The verification card's state, for typed notes and table visits alike.
// Pure functions, so the table rules and "Confirm" gating are unit tested.
import type { Clarification, ParseResponse, Rejection } from '../../shared/parse/types'
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
  rows: VerifyRow[]
  changes: string[]
  mismatches: VerifyMismatch[]
  tableCorrections: TableCorrection[]
  clarifications: Clarification[]
  rejected: Rejection[]
  skipped: string[]
  trimmed: boolean
}

/** A typed note: the note validator already enforced tables, so every row is ready. */
export function fromParseResponse(res: ParseResponse, makeKey: () => string): VerifyState {
  return {
    kind: 'note',
    source: res.source,
    notice: res.notice,
    startTable: null,
    rows: res.tasks.map((t) => ({
      ...t,
      key: makeKey(),
      tableSource: 'spoken',
      tableStatus: 'ok',
      tableOptions: [],
      heardTable: null,
      tableMessage: '',
      changes: [],
    })),
    changes: [],
    mismatches: [],
    tableCorrections: [],
    clarifications: res.needs_clarification,
    rejected: res.rejected,
    skipped: res.skipped,
    trimmed: false,
  }
}

export function fromVisitResponse(res: VisitResponse, startTable: number | null, makeKey: () => string): VerifyState {
  const rows = res.tasks.map((t) => ({ ...t, key: makeKey() }))
  return {
    kind: 'visit',
    source: res.source,
    notice: res.notice,
    startTable,
    rows,
    changes: res.changes,
    mismatches: res.mismatches
      .filter((m) => rows[m.taskIndex])
      .map((m) => ({ key: makeKey(), rowKey: rows[m.taskIndex].key, guest: m.guest, readBack: m.readBack, choice: null })),
    tableCorrections: res.tableCorrections,
    clarifications: res.needs_clarification,
    rejected: res.rejected,
    skipped: res.skipped,
    trimmed: res.trimmed,
  }
}

export function setRowTable(state: VerifyState, rowKey: string, table: number | null, section: number[]): VerifyState {
  return { ...state, rows: state.rows.map((r) => (r.key === rowKey ? chooseTable(r, table, section) : r)) }
}

/**
 * A conflict button: "You started on Table 4 but said table 1". The answer applies
 * to every task in this visit with the same question, so the server answers once.
 */
export function resolveConflict(state: VerifyState, rowKey: string, table: number, section: number[]): VerifyState {
  const row = state.rows.find((r) => r.key === rowKey)
  if (!row) return state
  const same = (r: VerifyRow) =>
    r.key === rowKey || (r.tableStatus === 'conflict' && r.tableOptions.join() === row.tableOptions.join())
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
  const text = choice === 'guest' ? m.guest : m.readBack
  return {
    ...state,
    mismatches: state.mismatches.map((x) => (x.key === key ? { ...x, choice } : x)),
    rows: state.rows.map((r) => (r.key === m.rowKey ? { ...r, text: text[0].toUpperCase() + text.slice(1) } : r)),
  }
}

/** Can the server tap Confirm? If not, say exactly what's left. */
export function readiness(state: VerifyState, section: number[]): { ready: boolean; blockers: string[] } {
  const rows = state.rows.filter((r) => r.text.trim())
  const blockers: string[] = []
  const count = (n: number, one: string, many: string) => (n === 1 ? one : many.replace('#', String(n)))
  const conflict = rows.filter((r) => r.tableStatus === 'conflict').length
  const noTable = rows.filter((r) => r.tableStatus === 'missing' || (r.tableStatus === 'ok' && r.table === null)).length
  const outside = rows.filter((r) => r.tableStatus === 'outside' || (r.table !== null && !section.includes(r.table))).length
  const open = state.mismatches.filter((m) => m.choice === null).length
  if (conflict) blockers.push(count(conflict, 'Choose which table for 1 task.', 'Choose which table for # tasks.'))
  if (noTable) blockers.push(count(noTable, 'Pick a table for 1 task.', 'Pick a table for # tasks.'))
  if (outside) blockers.push(count(outside, '1 task is outside your section.', '# tasks are outside your section.'))
  if (open) blockers.push(count(open, 'Choose a version for 1 mismatch.', 'Choose a version for # mismatches.'))
  return { ready: rows.length > 0 && blockers.length === 0, blockers }
}
