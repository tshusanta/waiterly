// Small HTTP helpers for the serverless functions.

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } })
}

export function errorResponse(message: string, status: number, headers: Record<string, string> = {}): Response {
  return json({ error: message }, status, headers)
}

const MAX_BODY_BYTES = 32_000

/** Read a JSON body with a size cap. Returns null if it's missing, too big or not JSON. */
export async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text()
    if (!text || text.length > MAX_BODY_BYTES) return null
    const parsed: unknown = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'local'
}

// Per-IP sliding-window rate limit. In-memory, so each serverless instance
// counts on its own. That's enough to stop casual abuse of the API key in a
// demo. A production app would use a shared store such as Redis.
const hits = new Map<string, number[]>()

export function rateLimit(
  key: string,
  limit: number,
  windowMs = 60_000,
  now = Date.now(),
): { ok: true } | { ok: false; retryAfterSec: number } {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= limit) {
    hits.set(key, recent)
    return { ok: false, retryAfterSec: Math.ceil((windowMs - (now - recent[0])) / 1000) }
  }
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 5_000) hits.clear() // memory guard
  return { ok: true }
}

export function rateLimited(retryAfterSec: number): Response {
  return errorResponse(
    `Too many requests. Wait ${retryAfterSec} seconds and try again.`,
    429,
    { 'Retry-After': String(retryAfterSec) },
  )
}
