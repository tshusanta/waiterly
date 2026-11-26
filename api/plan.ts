// POST /api/plan: group open tasks into at most 3 trips.
// The AI plans first. Its plan is checked against the real task ids. On any failure
// the deterministic planner runs (urgent first, longest waits, grouped by station).
// An outer safety net means this endpoint never answers with a 500.
import { fallbackPlan, readPlanTasks, validatePlan, type PlanResponse } from '../shared/plan.js'
import { getProvider } from '../server/provider.js'
import { clientIp, errorResponse, json, rateLimit, rateLimited, readJsonBody } from '../server/http.js'
import { fallbackNotice, isNotConfigured, logAiFailure, logUnexpected } from '../server/notice.js'

async function handle(request: Request): Promise<Response> {
  const limit = rateLimit(`plan:${clientIp(request)}`, 20)
  if (!limit.ok) return rateLimited(limit.retryAfterSec)

  const body = await readJsonBody(request)
  if (!body) return errorResponse('Send JSON with a "tasks" list.', 400)
  const tasks = readPlanTasks(body.tasks)
  if (tasks.length === 0) return json({ source: 'fallback', trips: [] } satisfies PlanResponse)

  try {
    const raw = await getProvider().planTrips({ tasks })
    return json({ source: 'ai', trips: validatePlan(raw, tasks) } satisfies PlanResponse)
  } catch (err) {
    logAiFailure('plan', err)
    return json({
      source: 'fallback',
      reason: isNotConfigured(err) ? 'not_configured' : 'ai_error',
      notice: fallbackNotice(err, 'rule-based planner'),
      trips: fallbackPlan(tasks),
    } satisfies PlanResponse)
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    return await handle(request)
  } catch (err) {
    logUnexpected('plan', err)
    return json({
      source: 'fallback',
      reason: 'ai_error',
      notice: "Couldn't plan trips right now. Work the table cards from the top: they're already sorted by priority and wait.",
      trips: [],
    } satisfies PlanResponse)
  }
}
