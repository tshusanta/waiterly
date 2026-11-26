// Browser API client. If the server can't be reached at all, the same shared
// fallback code runs in the browser, so the demo never dead-ends.
import { fallbackParse } from '../../shared/parse/fallback'
import type { OpenTaskRef, ParseResponse } from '../../shared/parse/types'
import { validateParseResult } from '../../shared/parse/validate'
import { fallbackPlan, type PlanResponse, type PlanTask } from '../../shared/plan'
import type { ShiftStats } from '../../shared/stats'
import { fallbackSummary, type SummaryResponse } from '../../shared/summary'
import { fallbackVisit } from '../../shared/visit/fallback'
import { trimTranscript } from '../../shared/visit/tables'
import type { VisitResponse } from '../../shared/visit/types'
import { validateVisitResult } from '../../shared/visit/validate'

/** A message the server wants shown as-is (validation, rate limit). */
export class ApiMessageError extends Error {}
class NetworkError extends Error {}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new NetworkError()
  }
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    throw new NetworkError()
  }
  if (res.status === 400 || res.status === 429) {
    throw new ApiMessageError((data as { error?: string })?.error ?? 'Request was rejected. Try again.')
  }
  if (!res.ok) throw new NetworkError()
  return data as T
}

export async function parseNote(
  note: string,
  assignedTables: number[],
  openTasks: OpenTaskRef[],
): Promise<ParseResponse> {
  try {
    return await postJson<ParseResponse>('/api/parse', { note, assignedTables, openTasks })
  } catch (err) {
    if (err instanceof ApiMessageError) throw err
    return {
      source: 'fallback',
      notice: "Couldn't reach the server. Used the keyword parser on this device. Double-check each task.",
      ...validateParseResult(fallbackParse(note), { note, assignedTables, openTasks }),
    }
  }
}

/** A table visit: the transcript (most recent ~8,000 characters), the starting table and the section. */
export async function parseVisit(
  transcript: string,
  startTable: number | null,
  assignedTables: number[],
  openTasks: OpenTaskRef[],
): Promise<VisitResponse> {
  const { text, trimmed } = trimTranscript(transcript)
  try {
    return await postJson<VisitResponse>('/api/parse', { mode: 'visit', transcript: text, trimmed, startTable, assignedTables, openTasks })
  } catch (err) {
    if (err instanceof ApiMessageError) throw err
    return {
      source: 'fallback',
      notice: "Couldn't reach the server. Used the keyword parser on this device. It can't follow changes in the conversation, so check each task.",
      ...validateVisitResult(fallbackVisit(text, startTable), { transcript: text, startTable, assignedTables, openTasks, trimmed }),
    }
  }
}

export async function planTrips(tasks: PlanTask[]): Promise<PlanResponse> {
  try {
    return await postJson<PlanResponse>('/api/plan', { tasks })
  } catch (err) {
    if (err instanceof ApiMessageError) throw err
    return {
      source: 'fallback',
      notice: "Couldn't reach the server. Planned on this device with the rule-based planner.",
      trips: fallbackPlan(tasks),
    }
  }
}

export async function summarizeShift(stats: ShiftStats): Promise<SummaryResponse> {
  try {
    return await postJson<SummaryResponse>('/api/summary', { stats })
  } catch (err) {
    if (err instanceof ApiMessageError) throw err
    return {
      source: 'fallback',
      reason: 'ai_error',
      notice: "Couldn't reach the server. Summary written on this device from the shift stats.",
      ...fallbackSummary(stats),
    }
  }
}

export interface Health {
  aiConfigured: boolean
  provider: 'anthropic' | 'gemini' | 'none'
  label?: string
  models?: { parse: string; plan: string; summary: string }
}

const NO_AI: Health = { aiConfigured: false, provider: 'none' }

/** Which AI is active. Times out after 6 s, so the badge never sticks on "checking". */
export async function getHealth(): Promise<Health> {
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(6_000) })
    if (!res.ok) return NO_AI
    return { ...NO_AI, ...((await res.json()) as Partial<Health>) }
  } catch {
    return NO_AI
  }
}
