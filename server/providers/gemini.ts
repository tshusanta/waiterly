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
  VISIT_SCHEMA,
  VISIT_SYSTEM_PROMPT,
  buildParseUserMessage,
  buildPlanUserMessage,
  buildSummaryUserMessage,
  buildVisitUserMessage,
} from '../prompt.js'
import { AI_TIMEOUT_MS, VISIT_TIMEOUT_MS, AiNotConfiguredError, AiUnavailableError, type AiProvider } from './types.js'

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash'

export function geminiModel(env: Record<string, string | undefined> = process.env): string {
  return env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL
}

const LEVELS: Record<string, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
}
/** Models that rejected MINIMAL (400) during this instance's lifetime, so we don't pay for that twice. */
const noMinimal = new Set<string>()

/**
 * As little thinking as each model allows. These are small extraction tasks, and
 * thinking is the main source of latency.
 *  - 2.x: thinkingBudget 0 (thinking off)
 *  - 3.x flash-lite: MINIMAL
 *  - other 3.x: LOW (gemini-3.8-flash returned 400 "MINIMAL not supported", 2026-11-26)
 * GEMINI_THINKING (off | minimal | low | medium | high) overrides it without a code change.
 * 3.x models can't turn thinking fully off, so "off" means MINIMAL there.
 */
export function thinkingFor(model: string, env: Record<string, string | undefined> = process.env): ThinkingConfig {
  const wanted = env.GEMINI_THINKING?.trim().toLowerCase()
  if (/^gemini-2\./.test(model)) {
    return wanted && wanted !== 'off' && wanted !== 'minimal' ? { thinkingBudget: -1 } : { thinkingBudget: 0 }
  }
  const level = wanted === 'off' ? 'minimal' : wanted && wanted in LEVELS ? wanted : /flash-lite/.test(model) ? 'minimal' : 'low'
  return { thinkingLevel: level === 'minimal' && noMinimal.has(model) ? ThinkingLevel.LOW : LEVELS[level] }
}

/** A 400 saying the thinking level isn't supported. We retry once on LOW. */
export function isThinkingRejected(err: unknown): boolean {
  return err instanceof ApiError && err.status === 400 && /thinking/i.test(err.message)
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

async function structuredCall(system: string, user: string, schema: object, budgetMs = AI_TIMEOUT_MS): Promise<unknown> {
  const model = geminiModel()
  const deadline = Date.now() + budgetMs // one budget for the whole call, retry included
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
    if (isThinkingRejected(err) && !noMinimal.has(model) && retryTimeoutMs(deadline - Date.now()) !== null) {
      noMinimal.add(model) // a 400 comes back fast, so the LOW retry still fits the budget
      response = await attempt()
    } else {
      if (!isRetryable(err) || retryTimeoutMs(deadline - Date.now()) === null) throw err
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
      response = await attempt()
    }
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
  parseVisit: (input) => structuredCall(VISIT_SYSTEM_PROMPT, buildVisitUserMessage(input), VISIT_SCHEMA, VISIT_TIMEOUT_MS),
  planTrips: ({ tasks }) => structuredCall(PLAN_SYSTEM_PROMPT, buildPlanUserMessage(tasks), PLAN_SCHEMA),
  summarizeShift: ({ stats }) => structuredCall(SUMMARY_SYSTEM_PROMPT, buildSummaryUserMessage(stats), SUMMARY_SCHEMA),
}

export interface GeminiModelInfo {
  id: string
  displayName: string
  inputTokenLimit: number | null
  outputTokenLimit: number | null
  thinking: boolean | null
  methods: string[]
}

/**
 * Google's ListModels for this key, flash and flash-lite only. A metadata call:
 * it doesn't generate anything or use the generateContent quota. Google doesn't
 * report free-tier rate limits here (those are on the AI Studio rate-limit page).
 */
export async function listGeminiModels(): Promise<GeminiModelInfo[]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new AiNotConfiguredError()
  const out: GeminiModelInfo[] = []
  let pageToken = ''
  for (let page = 0; page < 5; page++) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`
    const res = await fetch(url, { headers: { 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(8_000) })
    if (!res.ok) throw new AiUnavailableError(`ListModels failed: HTTP ${res.status}`)
    const body = (await res.json()) as { models?: Record<string, unknown>[]; nextPageToken?: string }
    for (const m of body.models ?? []) {
      const id = String(m.name ?? '').replace(/^models\//, '')
      if (!/flash/i.test(id)) continue
      out.push({
        id,
        displayName: String(m.displayName ?? ''),
        inputTokenLimit: typeof m.inputTokenLimit === 'number' ? m.inputTokenLimit : null,
        outputTokenLimit: typeof m.outputTokenLimit === 'number' ? m.outputTokenLimit : null,
        thinking: typeof m.thinking === 'boolean' ? m.thinking : null,
        methods: Array.isArray(m.supportedGenerationMethods) ? (m.supportedGenerationMethods as string[]) : [],
      })
    }
    if (!body.nextPageToken) break
    pageToken = body.nextPageToken
  }
  return out.filter((m) => m.methods.includes('generateContent')).sort((a, b) => a.id.localeCompare(b.id))
}

