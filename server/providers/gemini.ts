// Google Gemini provider (@google/genai). Server-only: the key comes from
// GEMINI_API_KEY and never reaches the browser. It uses the same prompts and
// JSON schemas as Claude, and its output goes through the same validators.
//
// Model: gemini-3.8-flash by default. gemini-2.5-flash (the original choice)
// returns 404 "no longer available to new users" for new keys, as seen live on
// 2026-11-26. Set GEMINI_MODEL in Vercel to override without a code change.
import { ApiError, GoogleGenAI, ThinkingLevel, type ThinkingConfig } from '@google/genai'
import {
  PARSE_SCHEMA,
  PARSE_SYSTEM_PROMPT,
  PLAN_SCHEMA,
  PLAN_SYSTEM_PROMPT,
  SUMMARY_SCHEMA,
  SUMMARY_SYSTEM_PROMPT,
  buildParseUserMessage,
  buildPlanUserMessage,
  buildSummaryUserMessage,
} from '../prompt.js'
import { AI_TIMEOUT_MS, AiNotConfiguredError, AiUnavailableError, type AiProvider } from './types.js'

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash'

export function geminiModel(env: Record<string, string | undefined> = process.env): string {
  return env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL
}

/** Keep thinking short for these small extraction tasks. 2.x models use a token budget, 3.x use a level. */
export function thinkingFor(model: string): ThinkingConfig {
  if (/^gemini-2\./.test(model)) return { thinkingBudget: 0 }
  // LOW is the lowest level gemini-3.8-flash accepts: MINIMAL returned 400 "not supported for this model" (2026-11-26).
  return { thinkingLevel: ThinkingLevel.LOW }
}

let client: GoogleGenAI | null = null
function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new AiNotConfiguredError()
  client ??= new GoogleGenAI({ apiKey })
  return client
}

/**
 * Worth one retry: 503 "high demand" and a per-minute 429 (both fast and usually brief).
 * Not worth it: a *daily* quota 429 (a retry just burns another request), 504, or a 400.
 */
export function isRetryable(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false
  if (err.status === 503) return true
  return err.status === 429 && !/per ?day|PerDay/i.test(err.message)
}

const RETRY_DELAY_MS = 700
// Gemini refuses a request deadline under 10 s with 400 "Minimum allowed deadline is 10s"
// (seen live on 2026-11-26: a retry sent with 9 s left failed that way).
export const MIN_GEMINI_DEADLINE_MS = 10_000

/** Time to give a retry after a failure, or null if the 15 s budget can't fit one Gemini accepts. */
export function retryTimeoutMs(remainingMs: number): number | null {
  const left = remainingMs - RETRY_DELAY_MS
  return left >= MIN_GEMINI_DEADLINE_MS ? left : null
}

async function structuredCall(system: string, user: string, schema: object): Promise<unknown> {
  const model = geminiModel()
  const deadline = Date.now() + AI_TIMEOUT_MS // one 15 s budget for the whole call, retry included
  const attempt = () => {
    const remaining = Math.max(MIN_GEMINI_DEADLINE_MS, deadline - Date.now())
    return getClient().models.generateContent({
      model,
      contents: user,
      config: {
        systemInstruction: system,
        responseMimeType: 'application/json',
        responseJsonSchema: schema,
        thinkingConfig: thinkingFor(model),
        abortSignal: AbortSignal.timeout(remaining),
        httpOptions: { timeout: remaining },
      },
    })
  }

  let response
  try {
    response = await attempt()
  } catch (err) {
    if (!isRetryable(err) || retryTimeoutMs(deadline - Date.now()) === null) throw err
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
    response = await attempt()
  }
  const finish = response.candidates?.[0]?.finishReason
  if (finish && finish !== 'STOP') throw new AiUnavailableError(`Model stopped early: ${finish}`)
  const text = response.text
  if (!text) throw new AiUnavailableError('No text in model response')
  return JSON.parse(text)
}

export const geminiProvider: AiProvider = {
  name: 'gemini',
  label: 'Gemini (Google)',
  get models() {
    const m = geminiModel()
    return { parse: m, plan: m, summary: m }
  },
  isConfigured: () => Boolean(process.env.GEMINI_API_KEY),
  parseNote: ({ note, section, openTasks }) =>
    structuredCall(PARSE_SYSTEM_PROMPT, buildParseUserMessage(note, section, openTasks), PARSE_SCHEMA),
  planTrips: ({ tasks }) => structuredCall(PLAN_SYSTEM_PROMPT, buildPlanUserMessage(tasks), PLAN_SCHEMA),
  summarizeShift: ({ stats }) => structuredCall(SUMMARY_SYSTEM_PROMPT, buildSummaryUserMessage(stats), SUMMARY_SCHEMA),
}
