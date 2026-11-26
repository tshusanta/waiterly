// Anthropic Claude provider. Server-only: the key comes from ANTHROPIC_API_KEY
// and never reaches the browser.
import Anthropic from '@anthropic-ai/sdk'
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

const MODELS = {
  parse: 'claude-haiku-5-5', // fast, cheap, structured extraction
  plan: 'claude-haiku-5-5',
  summary: 'claude-sonnet-5-5', // better prose for the manager summary
}

let client: Anthropic | null = null
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new AiNotConfiguredError()
  // No retries: the fallback is faster than a second attempt.
  client ??= new Anthropic({ timeout: AI_TIMEOUT_MS, maxRetries: 0 })
  return client
}

/** One structured-output call. Returns the parsed JSON object. */
async function structuredCall(model: string, system: string, user: string, schema: object): Promise<unknown> {
  const response = await getClient().messages.create({
    model,
    max_tokens: 4096,
    system,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: schema as Record<string, unknown> } },
    messages: [{ role: 'user', content: user }],
  })
  if (response.stop_reason !== 'end_turn') {
    throw new AiUnavailableError(`Model stopped early: ${response.stop_reason}`)
  }
  const block = response.content.find((b) => b.type === 'text')
  if (!block || block.type !== 'text') throw new AiUnavailableError('No text in model response')
  return JSON.parse(block.text)
}

/**
 * Manager summary on Sonnet 5.5, with Anthropic's server-side refusal fallback
 * turned on: if Sonnet declines, the API re-runs the same request on a fallback model.
 */
async function summaryCall(stats: unknown): Promise<unknown> {
  const response = await getClient().beta.messages.create({
    model: MODELS.summary,
    max_tokens: 2048,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SUMMARY_SYSTEM_PROMPT,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SUMMARY_SCHEMA as unknown as Record<string, unknown> } },
    messages: [{ role: 'user', content: buildSummaryUserMessage(stats) }],
  })
  if (response.stop_reason !== 'end_turn') {
    throw new AiUnavailableError(`Model stopped early: ${response.stop_reason}`)
  }
  const block = response.content.find((b) => b.type === 'text')
  if (!block || block.type !== 'text') throw new AiUnavailableError('No text in model response')
  return JSON.parse(block.text)
}

export const anthropicProvider: AiProvider = {
  name: 'anthropic',
  label: 'Claude (Anthropic)',
  models: MODELS,
  isConfigured: () => Boolean(process.env.ANTHROPIC_API_KEY),
  parseNote: ({ note, section, openTasks }) =>
    structuredCall(MODELS.parse, PARSE_SYSTEM_PROMPT, buildParseUserMessage(note, section, openTasks), PARSE_SCHEMA),
  planTrips: ({ tasks }) =>
    structuredCall(MODELS.plan, PLAN_SYSTEM_PROMPT, buildPlanUserMessage(tasks), PLAN_SCHEMA),
  summarizeShift: ({ stats }) => summaryCall(stats),
}
