// Claude calls. Server-only: the API key is read from the environment here and
// never sent to the browser.
import Anthropic from '@anthropic-ai/sdk'
import type { OpenTaskRef } from '../shared/parse/types.js'
import { PARSE_MODEL, PARSE_SCHEMA, PARSE_SYSTEM_PROMPT, buildParseUserMessage } from './prompt.js'

export const AI_TIMEOUT_MS = 15_000

export class AiUnavailableError extends Error {}

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

let client: Anthropic | null = null
function getClient(): Anthropic {
  if (!aiConfigured()) throw new AiUnavailableError('ANTHROPIC_API_KEY is not set')
  // No retries: the fallback parser is faster than a second attempt.
  client ??= new Anthropic({ timeout: AI_TIMEOUT_MS, maxRetries: 0 })
  return client
}

/** Ask Claude to structure the note. Returns the raw JSON (validated by the caller). */
export async function parseNoteWithClaude(
  note: string,
  section: number[],
  openTasks: OpenTaskRef[],
): Promise<unknown> {
  const response = await getClient().messages.create({
    model: PARSE_MODEL,
    max_tokens: 4096,
    system: PARSE_SYSTEM_PROMPT,
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: PARSE_SCHEMA },
    },
    messages: [{ role: 'user', content: buildParseUserMessage(note, section, openTasks) }],
  })

  if (response.stop_reason !== 'end_turn') {
    throw new AiUnavailableError(`Model stopped early: ${response.stop_reason}`)
  }
  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new AiUnavailableError('No text in model response')
  return JSON.parse(textBlock.text)
}
