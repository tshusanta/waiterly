// POST /api/summary: AI shift summary from computed stats only.
// Every number in the AI's text is checked against the stats; lines with
// invented numbers are dropped. On any failure the deterministic summary runs.
import { fallbackSummary, readStats, validateSummary, type SummaryResponse } from '../shared/summary.js'
import { provider } from '../server/provider.js'
import { clientIp, errorResponse, json, rateLimit, rateLimited, readJsonBody } from '../server/http.js'
import { fallbackNotice, logAiFailure } from '../server/notice.js'

export async function POST(request: Request): Promise<Response> {
  const limit = rateLimit(`summary:${clientIp(request)}`, 10)
  if (!limit.ok) return rateLimited(limit.retryAfterSec)

  const body = await readJsonBody(request)
  const stats = readStats(body?.stats)
  if (!stats) return errorResponse('Send JSON with a "stats" object.', 400)

  try {
    const raw = await provider.summarizeShift({ stats })
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
    return json({
      source: 'fallback',
      notice: fallbackNotice(err, 'stats-based summary').replace(' Double-check each task.', ''),
      ...fallbackSummary(stats),
    } satisfies SummaryResponse)
  }
}
