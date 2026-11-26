// Pure shift-state logic: persistence and updates. No React, so it's easy to unit test.
import { normalizeTables } from '../../shared/restaurant'
import type { SafeguardEvent, Settings, ShiftState, Task } from '../../shared/types'
import { createSeedShift } from './seed'

export const SHIFT_KEY = 'waiterly.shift.v1'
export const SETTINGS_KEY = 'waiterly.settings.v1'

/** The localStorage subset we use, so tests can pass a fake. */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function readJson(store: KeyValueStore | null, key: string): unknown {
  if (!store) return null
  try {
    const raw = store.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeJson(store: KeyValueStore | null, key: string, value: unknown): void {
  if (!store) return
  try {
    store.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked (private mode). The app keeps working in memory.
  }
}

export function loadSettings(store: KeyValueStore | null): Settings {
  const raw = readJson(store, SETTINGS_KEY) as Partial<Settings> | null
  return { assignedTables: normalizeTables(raw?.assignedTables) }
}

export function saveSettings(store: KeyValueStore | null, settings: Settings): void {
  writeJson(store, SETTINGS_KEY, settings)
}

function isShiftState(v: unknown): v is ShiftState {
  const s = v as ShiftState
  return (
    !!s &&
    s.version === 1 &&
    typeof s.startedAt === 'number' &&
    Array.isArray(s.tasks) &&
    Array.isArray(s.log)
  )
}

/** Load the saved shift, or start a fresh seeded one if nothing valid is stored. */
export function loadShift(store: KeyValueStore | null, now: number, tables: number[]): ShiftState {
  const raw = readJson(store, SHIFT_KEY)
  if (isShiftState(raw)) return raw
  const fresh = createSeedShift(now, tables)
  writeJson(store, SHIFT_KEY, fresh)
  return fresh
}

export function saveShift(store: KeyValueStore | null, shift: ShiftState): void {
  writeJson(store, SHIFT_KEY, shift)
}

export function resetShift(store: KeyValueStore | null, now: number, tables: number[]): ShiftState {
  const fresh = createSeedShift(now, tables)
  writeJson(store, SHIFT_KEY, fresh)
  return fresh
}

// ---- updates (all return a new state) ----

export function addTasks(shift: ShiftState, tasks: Task[]): ShiftState {
  return { ...shift, tasks: [...shift.tasks, ...tasks] }
}

export function completeTask(shift: ShiftState, id: string, now: number): ShiftState {
  return {
    ...shift,
    tasks: shift.tasks.map((t) => (t.id === id && t.doneAt === null ? { ...t, doneAt: now } : t)),
  }
}

export function undoTask(shift: ShiftState, id: string): ShiftState {
  return {
    ...shift,
    tasks: shift.tasks.map((t) => (t.id === id ? { ...t, doneAt: null } : t)),
  }
}

export function addLogEvents(shift: ShiftState, events: SafeguardEvent[]): ShiftState {
  return { ...shift, log: [...shift.log, ...events] }
}

// ---- selectors ----

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 } as const

/** Open tasks: high priority first, then the guest who has waited longest. */
export function openTasks(shift: ShiftState): Task[] {
  return shift.tasks
    .filter((t) => t.doneAt === null)
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.createdAt - b.createdAt)
}

/** Completed tasks, most recent first. */
export function doneTasks(shift: ShiftState): Task[] {
  return shift.tasks.filter((t) => t.doneAt !== null).sort((a, b) => b.doneAt! - a.doneAt!)
}
