import type { Category, Flag, Priority } from '../types.js'

/** A parsed task waiting for the server's approval (no id or timestamps yet). */
export interface DraftTask {
  table: number
  text: string
  category: Category
  priority: Priority
  flags: Flag[]
  note: string
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
}

export interface ParseResponse extends ParseResult {
  source: 'ai' | 'fallback'
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
