import type { Category, Flag, Priority } from '../types.js'

/** A parsed task waiting for the server's approval (no id or timestamps yet). */
export interface DraftTask {
  table: number
  text: string
  category: Category
  priority: Priority
  flags: Flag[]
  note: string
  /** Set when the item can't be served (sold out or not on the menu). The card holds it for the server. */
  unavailable?: Unavailable
}

export interface Unavailable {
  item: string
  reason: 'sold_out' | 'not_on_menu'
}

export interface Clarification {
  request: string
  question: string
}

export interface Rejection {
  request: string
  reason: string
}

export interface ParseResult {
  tasks: DraftTask[]
  needs_clarification: Clarification[]
  rejected: Rejection[]
  /** Tasks dropped because the same request is already open. */
  skipped: string[]
  /** The same tasks as skipped, structured, for the card's "Already on Table 4's list" line. */
  alreadyOpen?: OpenTaskRef[]
}

/** Why the fallback ran: no key configured, or the AI failed. */
export type FallbackReason = 'not_configured' | 'ai_error'

export interface ParseResponse extends ParseResult {
  source: 'ai' | 'fallback'
  reason?: FallbackReason
  /** Shown to the server when the fallback ran, so they know why. */
  notice?: string
}

export interface OpenTaskRef {
  table: number
  text: string
}

export interface ParseContext {
  note: string
  assignedTables: number[]
  openTasks: OpenTaskRef[]
}

export const NOTE_MAX_CHARS = 600
export const MAX_TASKS = 15
export const ALLERGY_NOTE = 'Confirm with kitchen before serving'
