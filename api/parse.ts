// POST /api/parse: turn a server's note into draft tasks for review.
// The configured AI provider runs first. On any failure (no key, timeout, error,
// bad output) the deterministic fallback runs, and the response says so.
// An outer safety net means this endpoint never answers with a 500.
import { normalizeTables } from '../shared/restaurant.js'
import { fallbackParse } from '../shared/parse/fallback.js'
import { cleanString } from '../shared/parse/text.js'
import { NOTE_MAX_CHARS, type OpenTaskRef, type ParseResponse } from '../shared/parse/types.js'
import { validateParseResult } from '../shared/parse/validate.js'
import { getProvider } from '../server/provider.js'
import { clientIp, errorResponse, json, rateLimit, rateLimited, readJsonBody } from '../server/http.js'
import { fallbackNotice, isNotConfigured, logAiFailure, logUnexpected } from '../server/notice.js'
import { fallbackVisit } from '../shared/visit/fallback.js'
import { trimTranscript } from '../shared/visit/tables.js'
import type { VisitResponse } from '../shared/visit/types.js'
import { validateVisitResult } from '../shared/visit/validate.js'

const VISIT_FALLBACK_HINT = `The keyword parser can't follow changes like "actually a Coke", so check each task against what was said.`

/** mode "visit": a table-visit transcript from the mic (or typed where speech isn't supported). */
async function handleVisit(body: Record<string, unknown>, assignedTables: number[], openTasks: OpenTaskRef[]): Promise<Response> {
  const raw = typeof body.transcript === 'string' ? body.transcript : ''
  if (!raw.trim()) return errorResponse('Nothing was heard in this visit. Try again, or type the request.', 400)
  // The browser already keeps the most recent ~8,000 characters; this is the server's own cap.
  const cut = trimTranscript(raw)
  const trimmed = cut.trimmed || body.trimmed === true
  const st = Number(body.startTable)
  const startTable = body.startTable === null || body.startTable === undefined || !Number.isInteger(st) ? null : st
  const ctx = { transcript: cut.text, startTable, assignedTables, openTasks, trimmed }

  try {
    const out = await getProvider().parseVisit({ transcript: cut.text, trimmed, startTable, section: assignedTables, openTasks })
    return json({ source: 'ai', ...validateVisitResult(out, ctx) } satisfies VisitResponse)
  } catch (err) {
    logAiFailure('parse:visit', err)
    return json({
      source: 'fallback',
      reason: isNotConfigured(err) ? 'not_configured' : 'ai_error',
      notice: `${fallbackNotice(err, 'keyword parser')} ${VISIT_FALLBACK_HINT}`,
      ...validateVisitResult(fallbackVisit(cut.text, startTable), ctx),
    } satisfies VisitResponse)
  }
}

const EMPTY_VISIT: VisitResponse = {
  source: 'fallback',
  reason: 'ai_error',
  notice: "Couldn't read that visit. Nothing was added. Try again, or type the request.",
  tasks: [], changes: [], mismatches: [], tableCorrections: [], needs_clarification: [], rejected: [], skipped: [], trimmed: false,
}

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

async function handle(request: Request, seen: { visit: boolean }): Promise<Response> {
  const limit = rateLimit(`parse:${clientIp(request)}`, 20)
  if (!limit.ok) return rateLimited(limit.retryAfterSec)

  const body = await readJsonBody(request)
  if (!body) return errorResponse('Send JSON with a "note" field.', 400)
  if (body.mode === 'visit') {
    seen.visit = true
    return handleVisit(body, normalizeTables(body.assignedTables), readOpenTasks(body.openTasks))
  }

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
    const raw = await getProvider().parseNote({ note, section: ctx.assignedTables, openTasks: ctx.openTasks })
    return json({ source: 'ai', ...validateParseResult(raw, ctx) } satisfies ParseResponse)
  } catch (err) {
    logAiFailure('parse', err)
    return json({
      source: 'fallback',
      reason: isNotConfigured(err) ? 'not_configured' : 'ai_error',
      notice: fallbackNotice(err, 'keyword parser'),
      ...validateParseResult(fallbackParse(note), ctx),
    } satisfies ParseResponse)
  }
}

export async function POST(request: Request): Promise<Response> {
  const seen = { visit: false }
  try {
    return await handle(request, seen)
  } catch (err) {
    // Safety net: even a bug in the fallback returns a usable answer, not a 500.
    logUnexpected('parse', err)
    if (seen.visit) return json(EMPTY_VISIT)
    return json({
      source: 'fallback',
      reason: 'ai_error',
      notice: "Couldn't read that note. Nothing was added. Try rewording it or splitting it into shorter notes.",
      tasks: [],
      needs_clarification: [],
      rejected: [],
      skipped: [],
    } satisfies ParseResponse)
  }
}
