// POST /api/summary: AI shift summary from computed stats only.
// Every number in the AI's text is checked against the stats, and lines with
// invented numbers are dropped. With no key, the response says "AI summary needs
// an API key" and includes a summary written from the stats.
// An outer safety net means this endpoint never answers with a 500.
import { NEEDS_KEY_NOTICE, fallbackSummary, readStats, validateSummary, type SummaryResponse } from '../shared/summary.js'
import { getProvider } from '../server/provider.js'
import { clientIp, errorResponse, json, rateLimit, rateLimited, readJsonBody } from '../server/http.js'
import { fallbackNotice, isNotConfigured, logAiFailure, logUnexpected } from '../server/notice.js'

async function handle(request: Request): Promise<Response> {
  const limit = rateLimit(`summary:${clientIp(request)}`, 10)
  if (!limit.ok) return rateLimited(limit.retryAfterSec)

  const body = await readJsonBody(request)
  const stats = readStats(body?.stats)
  if (!stats) return errorResponse('Send JSON with a "stats" object.', 400)

  try {
    const raw = await getProvider().summarizeShift({ stats })
    const { summary, dropped } = validateSummary(raw, stats)
    return json({
      source: 'ai',
      ...summary,
      notice: dropped
        ? `Removed ${dropped} AI ${dropped === 1 ? 'line that used a number' : 'lines that used numbers'} not in the shift stats.`
        : undefined,
    } satisfies SummaryResponse)
  } catch (err) {
    logAiFailure('summary', err)
    const notConfigured = isNotConfigured(err)
    return json({
      source: 'fallback',
      reason: notConfigured ? 'not_configured' : 'ai_error',
      notice: notConfigured ? NEEDS_KEY_NOTICE : fallbackNotice(err, 'stats-based summary').replace(' Double-check each task.', ''),
      ...fallbackSummary(stats),
    } satisfies SummaryResponse)
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    return await handle(request)
  } catch (err) {
    logUnexpected('summary', err)
    return json({
      source: 'fallback',
      reason: 'ai_error',
      notice: "Couldn't write a summary right now. The numbers above are current.",
      headline: 'Summary unavailable',
      insights: [],
      action: 'Use the stats above for now and try again in a minute.',
    } satisfies SummaryResponse)
  }
}
