// The contract every AI provider implements. Providers return *raw* JSON only:
// validation and safety rules live in shared/ and run on whatever comes back,
// so swapping providers can never bypass the safeguards.
import type { OpenTaskRef } from '../../shared/parse/types.js'
import type { PlanTask } from '../../shared/plan.js'
import type { ShiftStats } from '../../shared/stats.js'

export interface AiProvider {
  /** Shown in /api/health and the docs, e.g. "anthropic". */
  name: string
  models: { parse: string; plan: string; summary: string }
  /** False when credentials are missing. The app then runs in FALLBACK MODE. */
  isConfigured(): boolean
  parseNote(input: { note: string; section: number[]; openTasks: OpenTaskRef[] }): Promise<unknown>
  planTrips(input: { tasks: PlanTask[] }): Promise<unknown>
  summarizeShift(input: { stats: ShiftStats }): Promise<unknown>
}

/** Thrown for "AI can't answer right now". Callers switch to the deterministic fallback. */
export class AiUnavailableError extends Error {}

export const AI_TIMEOUT_MS = 15_000
