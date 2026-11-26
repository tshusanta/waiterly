// The contract every AI provider implements. Providers return *raw* JSON only:
// validation and safety rules live in shared/ and run on whatever comes back,
// so switching providers can never bypass the safeguards.
import type { OpenTaskRef } from '../../shared/parse/types.js'
import type { PlanTask } from '../../shared/plan.js'
import type { ShiftStats } from '../../shared/stats.js'

export type ProviderName = 'anthropic' | 'gemini' | 'none'

export interface AiProvider {
  /** Shown in /api/health and on the "How it works" page. */
  name: ProviderName
  /** Display label, e.g. "Claude (Anthropic)". */
  label: string
  models: { parse: string; plan: string; summary: string }
  /** False when no key is set. The app then runs in FALLBACK MODE. */
  isConfigured(): boolean
  parseNote(input: { note: string; section: number[]; openTasks: OpenTaskRef[] }): Promise<unknown>
  planTrips(input: { tasks: PlanTask[] }): Promise<unknown>
  summarizeShift(input: { stats: ShiftStats }): Promise<unknown>
}

/** Thrown for "AI can't answer right now". Callers switch to the deterministic fallback. */
export class AiUnavailableError extends Error {}

/** Thrown when no API key is configured at all. This is expected, not an error. */
export class AiNotConfiguredError extends AiUnavailableError {
  constructor() {
    super('No AI API key is set')
  }
}

export const AI_TIMEOUT_MS = 15_000
