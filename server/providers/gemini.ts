// Google Gemini provider (gemini-2.5-flash via @google/genai). Server-only: the
// key comes from GEMINI_API_KEY and never reaches the browser. It uses the same
// prompts and JSON schemas as Claude, and its output goes through the same validators.
import { GoogleGenAI } from '@google/genai'
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

const MODEL = 'gemini-2.5-flash'

let client: GoogleGenAI | null = null
function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new AiNotConfiguredError()
  client ??= new GoogleGenAI({ apiKey })
  return client
}

async function structuredCall(system: string, user: string, schema: object): Promise<unknown> {
  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: user,
    config: {
      systemInstruction: system,
      responseMimeType: 'application/json',
      responseJsonSchema: schema,
      thinkingConfig: { thinkingBudget: 0 }, // speed: these are short extraction tasks
      abortSignal: AbortSignal.timeout(AI_TIMEOUT_MS),
      httpOptions: { timeout: AI_TIMEOUT_MS },
    },
  })
  const finish = response.candidates?.[0]?.finishReason
  if (finish && finish !== 'STOP') throw new AiUnavailableError(`Model stopped early: ${finish}`)
  const text = response.text
  if (!text) throw new AiUnavailableError('No text in model response')
  return JSON.parse(text)
}

export const geminiProvider: AiProvider = {
  name: 'gemini',
  label: 'Gemini (Google)',
  models: { parse: MODEL, plan: MODEL, summary: MODEL },
  isConfigured: () => Boolean(process.env.GEMINI_API_KEY),
  parseNote: ({ note, section, openTasks }) =>
    structuredCall(PARSE_SYSTEM_PROMPT, buildParseUserMessage(note, section, openTasks), PARSE_SCHEMA),
  planTrips: ({ tasks }) => structuredCall(PLAN_SYSTEM_PROMPT, buildPlanUserMessage(tasks), PLAN_SCHEMA),
  summarizeShift: ({ stats }) => structuredCall(SUMMARY_SYSTEM_PROMPT, buildSummaryUserMessage(stats), SUMMARY_SCHEMA),
}
