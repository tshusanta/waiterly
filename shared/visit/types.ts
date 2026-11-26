import type { Clarification, DraftTask, FallbackReason, OpenTaskRef, Rejection } from '../parse/types.js'

/** Where a task's table came from. */
export type TableSource = 'card' | 'spoken' | 'corrected' | 'none'

/**
 * ok: a section table, ready to add.
 * conflict: started on one card but another table was said; the server picks one.
 * missing: no table at all; the item is held until the server taps a table.
 * outside: the table heard is not in the section; pick a section table or remove.
 */
export type TableStatus = 'ok' | 'conflict' | 'missing' | 'outside'

export interface VisitTask extends Omit<DraftTask, 'table'> {
  table: number | null
  tableSource: TableSource
  tableStatus: TableStatus
  /** The two (or more) tables to choose between when status is "conflict". */
  tableOptions: number[]
  /** The table that was heard, for conflict and outside messages. */
  heardTable: number | null
  /** Plain-language explanation shown under the task when status is not ok. */
  tableMessage: string
  /** What changed during the conversation, e.g. "Iced tea -> Coke". */
  changes: string[]
}

/** The guest and the server's final read-back still disagree. The server picks one. */
export interface Mismatch {
  /** Index into tasks of the task this mismatch is about. */
  taskIndex: number
  guest: string
  readBack: string
}

export interface TableCorrection {
  from: number
  to: number
}

export interface VisitResult {
  tasks: VisitTask[]
  /** Visit-level changes not tied to one task, e.g. "Ranch removed". */
  changes: string[]
  mismatches: Mismatch[]
  tableCorrections: TableCorrection[]
  needs_clarification: Clarification[]
  rejected: Rejection[]
  skipped: string[]
  alreadyOpen?: OpenTaskRef[]
  /** True when the start of a long transcript was cut to fit. */
  trimmed: boolean
}

export interface VisitResponse extends VisitResult {
  source: 'ai' | 'fallback'
  reason?: FallbackReason
  notice?: string
}

export interface VisitContext {
  transcript: string
  startTable: number | null
  assignedTables: number[]
  openTasks: OpenTaskRef[]
  trimmed: boolean
}

export const TRANSCRIPT_MAX_CHARS = 8000
