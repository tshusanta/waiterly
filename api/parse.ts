// POST /api/parse: turn a server's note into draft tasks for review.
// The AI provider runs first. On any failure (no key, timeout, error, bad output)
// the deterministic fallback runs, and the response says so.
import { normalizeTables } from '../shared/restaurant.js'
import { fallbackParse } from '../shared/parse/fallback.js'
import { cleanString } from '../shared/parse/text.js'
import { NOTE_MAX_CHARS, type OpenTaskRef, type ParseResponse } from '../shared/parse/types.js'
import { validateParseResult } from '../shared/parse/validate.js'
import { provider } from '../server/provider.js'
import { fallbackNotice, logAiFailure } from '../server/notice.js'
import { clientIp, errorResponse, json, rateLimit, rateLimited, readJsonBody } from '../server/http.js'

function readOpenTasks(value: unknown): OpenTaskRef[] {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, 100)
    .map((t) => ({
      table: Number((t as Record<string, unknown>)?.table),
      text: cleanString((t as Record<string, unknown>)?.text, 80),
    }))
    .filter((t) => Number.isInteger(t.table) && t.text)
}

export async function POST(request: Request): Promise<Response> {
  const limit = rateLimit(`parse:${clientIp(request)}`, 20)
  if (!limit.ok) return rateLimited(limit.retryAfterSec)

  const body = await readJsonBody(request)
  if (!body) return errorResponse('Send JSON with a "note" field.', 400)

  const note = typeof body.note === 'string' ? body.note.trim() : ''
  if (!note) return errorResponse('Type or dictate a note first.', 400)
  if (note.length > NOTE_MAX_CHARS) {
    return errorResponse(`Note is too long (${note.length} characters). Keep it under ${NOTE_MAX_CHARS}.`, 400)
  }

  const ctx = {
    note,
    assignedTables: normalizeTables(body.assignedTables),
    openTasks: readOpenTasks(body.openTasks),
  }

  try {
    const raw = await provider.parseNote({ note, section: ctx.assignedTables, openTasks: ctx.openTasks })
    const result: ParseResponse = { source: 'ai', ...validateParseResult(raw, ctx) }
    return json(result)
  } catch (err) {
    logAiFailure('parse', err)
    const result: ParseResponse = {
      source: 'fallback',
      notice: fallbackNotice(err, 'keyword parser'),
      ...validateParseResult(fallbackParse(note), ctx),
    }
    return json(result)
  }
}
